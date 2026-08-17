import logging
import random
import asyncio
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Scenario, ScenarioStep, TaskLog, Account
from app.services.pool_service import get_commenting_pool, get_reaction_pool
from app.services.log_service import log_action, classify_telegram_error
from app.services.ai_service import generate_dynamic_step_text
from app.services.join_service import (
    get_known_chat_members, 
    record_chat_member, 
    record_banned_chat_member, 
    get_banned_chat_members, 
    is_banned_in_chat
)
from app.telegram.client import get_hydrogram_client
from app.telegram.preflight import check_chat_availability

logger = logging.getLogger(__name__)

async def execute_scenario(
    session: AsyncSession, 
    scenario_id: int, 
    chat_id: int | str,
    discussion_message_id: Optional[int] = None
):
    scenario_stmt = select(Scenario).where(Scenario.id == scenario_id, Scenario.is_active == True)
    scenario = (await session.execute(scenario_stmt)).scalar_one_or_none()
    
    if not scenario:
        logger.error(f"Сценарий {scenario_id} не найден или неактивен.")
        return

    steps_stmt = select(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id).order_by(ScenarioStep.step_order)
    steps = list((await session.execute(steps_stmt)).scalars().all())
    
    if not steps:
        logger.warning(f"В сценарии {scenario_id} нет шагов.")
        return

    exec_msg = f"Scenario executor: bots engaged chat {chat_id}" + (f" post #{discussion_message_id}" if discussion_message_id else "") + f" with scenario '{scenario.title}' (ID: {scenario_id})"
    logger.info(exec_msg)
    session.add(TaskLog(scenario_id=scenario_id, status="bots_engaged", error_message=exec_msg))
    await session.commit()

    roles_needed = sorted(list(set(step.role_id for step in steps)))
    commenting_pool = await get_commenting_pool(session)
    reaction_pool = await get_reaction_pool(session)
    
    if not commenting_pool:
        error_msg = "NOT_ENOUGH_ACCOUNTS_IN_POOL: Нет активных аккаунтов в пуле комментирования"
        logger.error(error_msg)
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
        session.add(log)
        await log_action(
            session,
            action_type="comment_send",
            status="error",
            target=str(chat_id),
            target_id=f"Нет аккаунтов • {chat_id}",
            details={
                "summary": "В базе данных нет активных аккаунтов в пуле комментирования",
                "category": "no_accounts",
                "badge": "Нет аккаунтов",
                "error": error_msg,
                "channel": str(chat_id)
            },
            scenario_id=scenario_id
        )
        await session.commit()
        return

    target_chat_id = chat_id
    default_reply_to = discussion_message_id
    post_context_text = ""
    probe_success = False
    last_diag = None
    last_ex = None
    not_found_count = 0
    bot_banned_count = 0

    # Probe client to inspect chat and resolve discussion target across candidate accounts
    for probe_account in commenting_pool:
        if is_banned_in_chat(str(chat_id), probe_account.id):
            bot_banned_count += 1
            continue

        probe_client = get_hydrogram_client(probe_account, probe_account.proxy)
        try:
            await probe_client.start()
        except Exception as e:
            last_diag = classify_telegram_error(e)
            last_ex = e
            logger.warning(f"Зонд-клиент аккаунта #{probe_account.id} (@{probe_account.username or probe_account.phone}) не запустился: {e}")
            continue

        try:
            # Check if target is a channel and resolve its discussion group
            is_channel = False
            try:
                chat_info = await probe_client.get_chat(chat_id)
                is_channel = getattr(chat_info, 'type', None) and (
                    str(chat_info.type).lower().endswith('channel') or getattr(chat_info.type, 'value', '') == 'channel'
                )
            except Exception as e:
                diag = classify_telegram_error(e)
                if diag["category"] == "chat_not_found":
                    not_found_count += 1
                elif diag["category"] in ["account_banned", "chat_closed", "peer_flood"]:
                    bot_banned_count += 1
                    record_banned_chat_member(str(chat_id), probe_account.id)
                logger.warning(f"Notice inspecting chat type for {chat_id} (acc #{probe_account.id}): {e}")
                await probe_client.stop()
                continue

            if is_channel or discussion_message_id:
                post_id = discussion_message_id
                if not post_id and is_channel:
                    try:
                        async for p in probe_client.get_chat_history(chat_id, limit=1):
                            post_id = p.id
                            break
                    except Exception as hist_err:
                        diag = classify_telegram_error(hist_err)
                        if diag["category"] in ["account_banned", "chat_closed", "peer_flood"]:
                            bot_banned_count += 1
                            record_banned_chat_member(str(chat_id), probe_account.id)
                            await probe_client.stop()
                            continue
                        post_id = None

                if post_id:
                    try:
                        disc_msg = await probe_client.get_discussion_message(chat_id, post_id)
                        if disc_msg and getattr(disc_msg, 'chat', None):
                            target_chat_id = disc_msg.chat.id
                            default_reply_to = disc_msg.id
                            post_context_text = getattr(disc_msg, 'text', None) or getattr(disc_msg, 'caption', None) or ""
                            logger.info(f"Resolved discussion for channel {chat_id} post {post_id}: group={target_chat_id}, header_id={default_reply_to}, post_len={len(post_context_text)}")
                        else:
                            raise ValueError("Discussion message has no valid chat")
                    except Exception as ex:
                        diag = classify_telegram_error(ex)
                        last_diag = diag
                        last_ex = ex
                        # If account is banned in channel/group or channel private for this bot, record ban and try next bot!
                        bot_banned_count += 1
                        record_banned_chat_member(str(chat_id), probe_account.id)
                        logger.warning(f"Аккаунт #{probe_account.id} (@{probe_account.username or probe_account.phone}) не имеет доступа к обсуждению канала {chat_id} ({diag['badge']}): {ex}. Пробуем следующий аккаунт...")
                        await probe_client.stop()
                        continue
                elif is_channel:
                    diag = classify_telegram_error("нет опубликованных постов")
                    error_msg = f"{diag['badge']}: В канале {chat_id} нет опубликованных постов для комментирования"
                    logger.error(error_msg)
                    log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
                    session.add(log)
                    await log_action(
                        session,
                        action_type="comment_send",
                        status="error",
                        target=str(chat_id),
                        target_id=f"{diag['badge']} • {chat_id}",
                        details={
                            "summary": diag["summary"],
                            "category": diag["category"],
                            "badge": diag["badge"],
                            "channel": str(chat_id)
                        },
                        scenario_id=scenario_id
                    )
                    await session.commit()
                    await probe_client.stop()
                    return

            probe_success = True
            await probe_client.stop()
            break
        except Exception as ex:
            last_diag = classify_telegram_error(ex)
            last_ex = ex
            await probe_client.stop()
            continue

    if not probe_success:
        if not_found_count >= len(commenting_pool) or (last_diag and last_diag.get("category") == "chat_not_found"):
            diag = {"category": "chat_not_found", "badge": "Чат не найден", "summary": f"Канал или чат '{chat_id}' не существует в Telegram"}
            error_msg = f"Чат не найден: канал или группа '{chat_id}' не существует"
        elif bot_banned_count >= len(commenting_pool) or (bot_banned_count > 0 and not probe_success):
            diag = {"category": "all_bots_banned", "badge": "Все боты забанены", "summary": f"Все доступные боты из пула ({len(commenting_pool)} шт.) заблокированы или исключены из канала/чата {chat_id}"}
            error_msg = f"Все боты в чате {chat_id} забанены: ни один аккаунт из пула не имеет доступа"
        else:
            diag = last_diag or classify_telegram_error("no_accounts")
            error_msg = f"{diag['badge']}: Не удалось проверить канал {chat_id} (аккаунты заблокированы или недоступны: {diag['summary']})"

        logger.error(error_msg)
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
        session.add(log)
        await log_action(
            session,
            action_type="comment_send",
            status="error",
            target=str(chat_id),
            target_id=f"{diag['badge']} • {chat_id}",
            details={
                "summary": diag["summary"],
                "category": diag["category"],
                "badge": diag["badge"],
                "error": str(last_ex) if last_ex else error_msg,
                "channel": str(chat_id)
            },
            scenario_id=scenario_id
        )
        await session.commit()
        return

    # Filter available accounts that are NOT banned in this target chat
    unbanned_pool = [
        acc for acc in commenting_pool 
        if not is_banned_in_chat(str(target_chat_id), acc.id) and not is_banned_in_chat(str(chat_id), acc.id)
    ]

    if not unbanned_pool:
        diag = {"category": "all_bots_banned", "badge": "Все боты забанены", "summary": f"Все доступные боты ({len(commenting_pool)} шт.) забанены в целевом чате {target_chat_id}"}
        error_msg = f"Все боты в чате забанены: ни один бот из пула не может писать в {target_chat_id}"
        logger.error(error_msg)
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
        session.add(log)
        await log_action(
            session,
            action_type="comment_send",
            status="error",
            target=str(chat_id),
            target_id=f"{diag['badge']} • {chat_id}",
            details={
                "summary": diag["summary"],
                "category": diag["category"],
                "badge": diag["badge"],
                "error": error_msg,
                "channel": str(chat_id)
            },
            scenario_id=scenario_id
        )
        await session.commit()
        return

    # Prioritize accounts already known to be in group
    known_member_ids = get_known_chat_members(str(target_chat_id)) | get_known_chat_members(str(chat_id))
    in_group_accounts = [acc for acc in unbanned_pool if acc.id in known_member_ids]
    other_accounts = [acc for acc in unbanned_pool if acc.id not in known_member_ids]
    candidate_order = in_group_accounts + other_accounts

    # Verify and join candidate bots to target chat
    verified_bots: List[Account] = []
    verified_clients: Dict[int, Any] = {}

    for cand_acc in candidate_order:
        if is_banned_in_chat(str(target_chat_id), cand_acc.id):
            continue
        c = get_hydrogram_client(cand_acc, cand_acc.proxy)
        try:
            await c.start()
            # If not yet member, try to join
            if cand_acc.id not in known_member_ids:
                try:
                    await c.join_chat(target_chat_id)
                    record_chat_member(str(target_chat_id), cand_acc.id)
                except Exception as join_err:
                    diag = classify_telegram_error(join_err)
                    if diag["category"] in ["account_banned", "chat_closed", "peer_flood"]:
                        record_banned_chat_member(str(target_chat_id), cand_acc.id)
                        record_banned_chat_member(str(chat_id), cand_acc.id)
                        await c.stop()
                        continue
            
            record_chat_member(str(target_chat_id), cand_acc.id)
            verified_bots.append(cand_acc)
            verified_clients[cand_acc.id] = c

            if len(verified_bots) >= len(roles_needed):
                break
        except Exception as start_err:
            diag = classify_telegram_error(start_err)
            if diag["category"] in ["account_banned", "peer_flood"]:
                record_banned_chat_member(str(target_chat_id), cand_acc.id)
            try:
                await c.stop()
            except Exception:
                pass
            continue

    if not verified_bots:
        diag = {"category": "all_bots_banned", "badge": "Все боты забанены", "summary": f"Все боты из пула ({len(commenting_pool)} шт.) заблокированы или не смогли присоединиться к чату {chat_id}"}
        error_msg = f"Все боты в чате забанены: ни один бот не смог получить доступ к {chat_id}"
        logger.error(error_msg)
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
        session.add(log)
        await log_action(
            session,
            action_type="comment_send",
            status="error",
            target=str(chat_id),
            target_id=f"{diag['badge']} • {chat_id}",
            details={
                "summary": diag["summary"],
                "category": diag["category"],
                "badge": diag["badge"],
                "error": error_msg,
                "channel": str(chat_id)
            },
            scenario_id=scenario_id
        )
        await session.commit()
        return

    # Map roles to verified bots
    role_account_map: Dict[int, Account] = {}
    clients: Dict[int, Any] = {}

    for idx, role_id in enumerate(roles_needed):
        assigned_bot = verified_bots[idx % len(verified_bots)]
        role_account_map[role_id] = assigned_bot
        clients[role_id] = verified_clients[assigned_bot.id]

    logger.info(f"🎭 Scenario {scenario_id} assigned roles: {[(r_id, acc.custom_name or acc.username or acc.first_name or acc.id) for r_id, acc in role_account_map.items()]}")

    step_msg_map: Dict[int, int] = {}
    
    for idx, step in enumerate(steps):
        role_id = step.role_id
        client = clients[role_id]
        
        # Lazy join chat right before this bot speaks (prevents all bots joining at the exact same second)
        if role_id not in joined_roles:
            try:
                await client.join_chat(target_chat_id)
                joined_roles.add(role_id)
            except Exception:
                pass

        delay_min = step.delay_before_min if step.delay_before_min is not None else scenario.min_delay
        delay_max = step.delay_before_max if step.delay_before_max is not None else scenario.max_delay
        
        reply_to = default_reply_to
        if step.reply_to_step_id and step.reply_to_step_id in step_msg_map:
            reply_to = step_msg_map[step.reply_to_step_id]

        try:
            is_dynamic_step = getattr(step, 'is_ai_dynamic', False) or getattr(scenario, 'mode', 'manual') == 'ai_dynamic'
            text_to_send = (step.text or "").strip()
            if is_dynamic_step:
                try:
                    thread_history = []
                    for p_step in steps:
                        if p_step.id in step_msg_map:
                            p_acc = role_account_map.get(p_step.role_id)
                            sender_label = f"Participant #{p_step.role_id}"
                            if p_acc and (p_acc.first_name or p_acc.username):
                                sender_label = p_acc.first_name or p_acc.username or sender_label
                            thread_history.append({"sender": sender_label, "text": getattr(p_step, '_gen_text', p_step.text or '')})

                    post_ctx = post_context_text.strip() if post_context_text else (getattr(scenario, 'title', None) or str(target_chat_id))
                    gen_text = await generate_dynamic_step_text(
                        session=session,
                        post_text=post_ctx,
                        step_prompt=step.ai_prompt or step.text or "Напиши естественный комментарий по теме поста",
                        persona_instruction=getattr(scenario, 'system_instruction', None),
                        thread_history=thread_history,
                        override_provider=getattr(scenario, 'ai_provider', None),
                        override_model=getattr(scenario, 'ai_model', None)
                    )
                    if gen_text and gen_text.strip():
                        text_to_send = gen_text.strip()
                        setattr(step, '_gen_text', text_to_send)
                        await log_action(
                            session,
                            action_type="ai_dynamic_gen",
                            status="ok",
                            account_id=role_account_map[role_id].id,
                            target=str(target_chat_id),
                            target_id=f"step #{step.id}",
                            details={"prompt": step.ai_prompt or step.text, "generated_text": text_to_send},
                            scenario_id=scenario_id
                        )
                except Exception as ai_err:
                    logger.warning(f"Dynamic AI generation notice for step {step.id}: {ai_err}")

            # Ensure message is never empty or invalid characters
            text_to_send = text_to_send.replace('\x00', '').strip()
            if not text_to_send:
                fallbacks = ["👍", "Согласен", "Интересно", "Понятно", "🔥", "+", "Хорошая мысль"]
                text_to_send = random.choice(fallbacks)
                logger.warning(f"Step {step.id} had empty text; applied fallback: '{text_to_send}'")

            msg = await client.send_message(
                chat_id=target_chat_id,
                text=text_to_send,
                reply_to_message_id=reply_to
            )
            
            if msg:
                msg_id = getattr(msg, 'id', None) or getattr(msg, 'message_id', 0)
                step_msg_map[step.id] = msg_id
                
                log = TaskLog(account_id=role_account_map[role_id].id, scenario_id=scenario_id, status="success")
                session.add(log)
                await log_action(
                    session,
                    action_type="comment_send",
                    status="ok",
                    account_id=role_account_map[role_id].id,
                    target=str(target_chat_id),
                    target_id=f"msg #{msg_id}",
                    details={"text": text_to_send, "reply_to": reply_to, "step_id": step.id},
                    scenario_id=scenario_id
                )
                await session.commit()
                
                source = getattr(step, 'reaction_source', 'pool')
                if step.reactions or source == 'ai_smart':
                    reactors = []
                    
                    if source == 'roles' and getattr(step, 'reaction_roles', None):
                        try:
                            target_roles = [int(r.strip()) for r in step.reaction_roles.split() if r.strip()]
                            for r_id in target_roles:
                                if r_id in role_account_map:
                                    reactors.append(role_account_map[r_id])
                        except Exception as e:
                            logger.error(f"Ошибка парсинга reaction_roles: {e}")
                    
                    if not reactors and reaction_pool:
                        count = step.reaction_count or 1
                        reactors = random.sample(reaction_pool, min(count, len(reaction_pool)))
                    
                    reactions = step.reactions.split() if step.reactions else []
                    if source == 'ai_smart' or not reactions:
                        reactions = ["🔥", "👍", "❤️", "😍", "👏", "🎉", "🤝", "💯"]

                    for r_acc in reactors:
                        r_client = get_hydrogram_client(r_acc, r_acc.proxy)
                        try:
                            await r_client.start()
                            # Telegram API requires strictly 1 emoji per reaction
                            emoji = random.choice(reactions)
                            # Realistic human delay before placing reaction (3 to 6 seconds)
                            await asyncio.sleep(random.uniform(3.0, 6.0))
                            await r_client.send_reaction(target_chat_id, msg_id, emoji)
                            logger.info(f"Аккаунт {r_acc.id} поставил реакцию {emoji}")
                            await log_action(
                                session,
                                action_type="reaction_add",
                                status="ok",
                                account_id=r_acc.id,
                                target=str(target_chat_id),
                                target_id=f"msg #{msg_id}",
                                details={"emoji": emoji, "source": source},
                                scenario_id=scenario_id
                            )
                        except Exception as e:
                            logger.error(f"Ошибка постановки реакции аккаунтом {r_acc.id}: {e}")
                        finally:
                            await r_client.stop()

            # Pause AFTER message and reactions, throttling the next step's AI query and Telegram request
            if idx < len(steps) - 1:
                step_delay = random.uniform(delay_min, delay_max)
                if step_delay > 0:
                    logger.info(f"Пауза {step_delay:.1f}с после шага #{step.id} перед следующим сообщением...")
                    await asyncio.sleep(step_delay)

        except Exception as e:
            diag = classify_telegram_error(e)
            if diag["category"] in ["account_banned", "chat_closed", "peer_flood"]:
                record_banned_chat_member(str(target_chat_id), role_account_map[role_id].id)
                record_banned_chat_member(str(chat_id), role_account_map[role_id].id)
            logger.error(f"Ошибка на шаге {step.id} ({diag['badge']}): {e}")
            log = TaskLog(account_id=role_account_map[role_id].id, scenario_id=scenario_id, status="error", error_message=f"{diag['badge']}: {str(e)}")
            session.add(log)
            await log_action(
                session,
                action_type="comment_send",
                status="error",
                account_id=role_account_map[role_id].id,
                target=str(target_chat_id),
                target_id=f"{diag['badge']} • шаг #{step.step_order or step.id}",
                details={
                    "summary": diag["summary"],
                    "category": diag["category"],
                    "badge": diag["badge"],
                    "error": str(e),
                    "text": text_to_send
                },
                scenario_id=scenario_id
            )
            await session.commit()
            break

    for c in set(clients.values()):
        try:
            await c.stop()
        except Exception:
            pass
