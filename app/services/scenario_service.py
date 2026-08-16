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
        await session.commit()
        return

    # Probe client to inspect chat and resolve discussion target
    probe_account = commenting_pool[0]
    probe_client = get_hydrogram_client(probe_account, probe_account.proxy)
    try:
        await probe_client.start()
    except Exception as e:
        logger.error(f"Не удалось запустить зонд-клиент для аккаунта {probe_account.id}: {e}")
        log = TaskLog(account_id=probe_account.id, scenario_id=scenario_id, status="error", error_message=f"Probe client init failed: {e}")
        session.add(log)
        await session.commit()
        return

    target_chat_id = chat_id
    default_reply_to = discussion_message_id

    # Check if target is a channel and resolve its discussion group
    is_channel = False
    try:
        chat_info = await probe_client.get_chat(chat_id)
        is_channel = getattr(chat_info, 'type', None) and (
            str(chat_info.type).lower().endswith('channel') or getattr(chat_info.type, 'value', '') == 'channel'
        )
    except Exception as e:
        logger.warning(f"Notice inspecting chat type for {chat_id}: {e}")

    if is_channel or discussion_message_id:
        post_id = discussion_message_id
        if not post_id and is_channel:
            try:
                async for p in probe_client.get_chat_history(chat_id, limit=1):
                    post_id = p.id
                    break
            except Exception:
                post_id = None

        if post_id:
            try:
                disc_msg = await probe_client.get_discussion_message(chat_id, post_id)
                if disc_msg and getattr(disc_msg, 'chat', None):
                    target_chat_id = disc_msg.chat.id
                    default_reply_to = disc_msg.id
                    logger.info(f"Resolved discussion for channel {chat_id} post {post_id}: group={target_chat_id}, header_id={default_reply_to}")
                else:
                    raise ValueError("Discussion message has no valid chat")
            except Exception as ex:
                diag = classify_telegram_error(ex)
                error_msg = f"{diag['badge']}: У канала {chat_id} отключены комментарии или нет группы для обсуждений (post #{post_id})"
                logger.error(error_msg)
                log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
                session.add(log)
                await log_action(
                    session,
                    action_type="comment_send",
                    status="error",
                    target=str(chat_id),
                    target_id=f"{diag['badge']} • post #{post_id}",
                    details={
                        "summary": diag["summary"],
                        "category": diag["category"],
                        "badge": diag["badge"],
                        "error": str(ex),
                        "channel": str(chat_id),
                        "post_id": post_id
                    },
                    scenario_id=scenario_id
                )
                await session.commit()
                await probe_client.stop()
                return
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

    # Check preflight availability on target
    requires_media = any(step.media_path for step in steps)
    is_available, error_msg = await check_chat_availability(probe_client, target_chat_id, requires_media)
    if not is_available:
        logger.error(f"Preflight failed: {error_msg}")
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=f"Preflight: {error_msg}")
        session.add(log)
        await session.commit()
        await probe_client.stop()
        return

    await probe_client.stop()

    # SMART BOT SELECTION: Prioritize and filter bots that are ALREADY in the group
    from app.services.join_service import get_known_chat_members, record_chat_member
    known_member_ids = get_known_chat_members(str(target_chat_id)) | get_known_chat_members(str(chat_id))
    
    in_group_accounts = [acc for acc in commenting_pool if acc.id in known_member_ids]
    
    # If no bots in cache, check membership for active bots
    if not in_group_accounts:
        for acc in commenting_pool[:10]: # Check top candidate accounts
            c_test = get_hydrogram_client(acc, acc.proxy)
            try:
                await c_test.start()
                member = await c_test.get_chat_member(target_chat_id, "me")
                if member and getattr(member, 'status', None):
                    st = str(member.status).lower()
                    if st not in ['left', 'kicked', 'banned']:
                        record_chat_member(str(target_chat_id), acc.id)
                        in_group_accounts.append(acc)
            except Exception:
                pass
            finally:
                try:
                    await c_test.stop()
                except Exception:
                    pass

    # SMART BOT SELECTION: Prioritize member bots, but ensure DISTINCT bots for distinct roles!
    from app.services.join_service import get_known_chat_members, record_chat_member
    known_member_ids = get_known_chat_members(str(target_chat_id)) | get_known_chat_members(str(chat_id))
    
    in_group_accounts = [acc for acc in commenting_pool if acc.id in known_member_ids]
    
    # Priority ordered pool: in-group bots first, then remaining active commenting bots
    candidate_pool = list(in_group_accounts)
    for acc in commenting_pool:
        if acc not in candidate_pool:
            candidate_pool.append(acc)

    role_account_map: Dict[int, Account] = {}
    used_account_ids = set()

    # Step 1: Check if role_id directly matches an account in pool
    for role_id in roles_needed:
        exact_match = next((a for a in candidate_pool if a.id == role_id and a.id not in used_account_ids), None)
        if exact_match:
            role_account_map[role_id] = exact_match
            used_account_ids.add(exact_match.id)

    # Step 2: Assign distinct accounts to remaining roles
    for role_id in roles_needed:
        if role_id not in role_account_map:
            available = [a for a in candidate_pool if a.id not in used_account_ids]
            if available:
                chosen = available[0]
                role_account_map[role_id] = chosen
                used_account_ids.add(chosen.id)
            else:
                # If there are genuinely fewer accounts in pool than roles, cycle from candidate_pool
                role_account_map[role_id] = candidate_pool[len(role_account_map) % len(candidate_pool)]

    logger.info(f"🎭 Scenario {scenario_id} assigned roles: {[(r_id, acc.custom_name or acc.username or acc.first_name or acc.id) for r_id, acc in role_account_map.items()]}")

    clients: Dict[int, Any] = {}
    unique_accounts = {acc.id: acc for acc in role_account_map.values()}
    account_client_map: Dict[int, Any] = {}

    for acc_id, account in unique_accounts.items():
        client = get_hydrogram_client(account, account.proxy)
        try:
            await client.start()
            account_client_map[acc_id] = client
        except Exception as e:
            logger.error(f"Не удалось запустить клиент для аккаунта {account.id}: {e}")
            for c in account_client_map.values():
                await c.stop()
            log = TaskLog(account_id=account.id, scenario_id=scenario_id, status="error", error_message=f"Init client failed: {e}")
            session.add(log)
            await session.commit()
            return

    for role_id, account in role_account_map.items():
        clients[role_id] = account_client_map[account.id]

    # Track joined roles to avoid duplicate joins and prevent simultaneous mass-joining
    joined_roles = set()
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

                    post_ctx = getattr(scenario, 'title', None) or str(target_chat_id)
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
