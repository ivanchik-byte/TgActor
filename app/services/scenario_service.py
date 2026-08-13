import logging
import random
import asyncio
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Scenario, ScenarioStep, TaskLog, Account
from app.services.pool_service import get_commenting_pool, get_reaction_pool
from app.services.log_service import log_action
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

    roles_needed = set(step.role_id for step in steps)
    commenting_pool = await get_commenting_pool(session)
    reaction_pool = await get_reaction_pool(session)
    
    if not commenting_pool:
        error_msg = "NOT_ENOUGH_ACCOUNTS_IN_POOL: Нет активных аккаунтов в пуле комментирования"
        logger.error(error_msg)
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
        session.add(log)
        await session.commit()
        return

    role_account_map: Dict[int, Account] = {}
    available_pool = list(commenting_pool)
    random.shuffle(available_pool)
    
    unassigned_roles = []
    for role_id in roles_needed:
        match = next((a for a in available_pool if a.id == role_id), None)
        if match:
            role_account_map[role_id] = match
            available_pool.remove(match)
        else:
            unassigned_roles.append(role_id)
            
    for role_id in unassigned_roles:
        if available_pool:
            fallback = available_pool.pop()
            role_account_map[role_id] = fallback
        else:
            role_account_map[role_id] = random.choice(commenting_pool)

    clients: Dict[int, Any] = {}
    for role_id, account in role_account_map.items():
        client = get_hydrogram_client(account, account.proxy)
        try:
            await client.start()
            clients[role_id] = client
        except Exception as e:
            logger.error(f"Не удалось запустить клиент для аккаунта {account.id}: {e}")
            for c in clients.values():
                await c.stop()
            log = TaskLog(account_id=account.id, scenario_id=scenario_id, status="error", error_message=f"Init client failed: {e}")
            session.add(log)
            await session.commit()
            return

    first_client = next(iter(clients.values()))
    requires_media = any(step.media_path for step in steps)
    
    is_available, error_msg = await check_chat_availability(first_client, chat_id, requires_media)
    if not is_available:
        logger.error(f"Preflight failed: {error_msg}")
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=f"Preflight: {error_msg}")
        session.add(log)
        await session.commit()
        
        for c in clients.values():
            await c.stop()
        return

    target_chat_id = chat_id
    default_reply_to = discussion_message_id

    # Check if target is a channel and resolve its discussion group
    is_channel = False
    try:
        chat_info = await first_client.get_chat(chat_id)
        is_channel = getattr(chat_info, 'type', None) and (
            str(chat_info.type).lower().endswith('channel') or getattr(chat_info.type, 'value', '') == 'channel'
        )
    except Exception as e:
        logger.warning(f"Notice inspecting chat type for {chat_id}: {e}")

    if is_channel or discussion_message_id:
        post_id = discussion_message_id
        if not post_id and is_channel:
            try:
                async for p in first_client.get_chat_history(chat_id, limit=1):
                    post_id = p.id
                    break
            except Exception:
                post_id = None

        if post_id:
            try:
                disc_msg = await first_client.get_discussion_message(chat_id, post_id)
                if disc_msg and getattr(disc_msg, 'chat', None):
                    target_chat_id = disc_msg.chat.id
                    default_reply_to = disc_msg.id
                    logger.info(f"Resolved discussion for channel {chat_id} post {post_id}: group={target_chat_id}, header_id={default_reply_to}")
                else:
                    raise ValueError("Discussion message has no valid chat")
            except Exception as ex:
                error_msg = f"У канала {chat_id} отключены комментарии или нет группы для обсуждений (post #{post_id}): {ex}"
                logger.error(error_msg)
                log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
                session.add(log)
                await log_action(
                    session,
                    action_type="comment_send",
                    status="error",
                    target=str(chat_id),
                    details={"error": error_msg, "channel": str(chat_id), "post_id": post_id},
                    scenario_id=scenario_id
                )
                await session.commit()
                for c in clients.values():
                    await c.stop()
                return
        elif is_channel:
            error_msg = f"В канале {chat_id} нет опубликованных постов для комментирования"
            logger.error(error_msg)
            log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
            session.add(log)
            await session.commit()
            for c in clients.values():
                await c.stop()
            return

    # Pre-join discussion group for all participating clients
    for c in clients.values():
        try:
            await c.join_chat(target_chat_id)
        except Exception:
            pass

    step_msg_map: Dict[int, int] = {}
    
    for step in steps:
        role_id = step.role_id
        client = clients[role_id]
        
        delay_min = step.delay_before_min if step.delay_before_min is not None else scenario.min_delay
        delay_max = step.delay_before_max if step.delay_before_max is not None else scenario.max_delay
        
        reply_to = default_reply_to
        if step.reply_to_step_id and step.reply_to_step_id in step_msg_map:
            reply_to = step_msg_map[step.reply_to_step_id]

        try:
            delay = random.uniform(delay_min, delay_max)
            await asyncio.sleep(delay)

            text_to_send = (step.text or "").strip()
            if getattr(step, 'is_ai_dynamic', False) or getattr(scenario, 'mode', 'manual') == 'ai_dynamic':
                try:
                    thread_history = []
                    for p_step in steps:
                        if p_step.id in step_msg_map:
                            p_acc = role_account_map.get(p_step.role_id)
                            sender_label = f"Participant #{p_step.role_id}"
                            if p_acc and (p_acc.first_name or p_acc.username):
                                sender_label = p_acc.first_name or p_acc.username or sender_label
                            thread_history.append({"sender": sender_label, "text": getattr(p_step, '_gen_text', p_step.text or '')})

                    gen_text = await generate_dynamic_step_text(
                        session=session,
                        post_text=str(chat_id),
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
                            await asyncio.sleep(random.uniform(0.5, 2.0))
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

        except Exception as e:
            logger.error(f"Ошибка на шаге {step.id}: {e}")
            log = TaskLog(account_id=role_account_map[role_id].id, scenario_id=scenario_id, status="error", error_message=str(e))
            session.add(log)
            await log_action(
                session,
                action_type="comment_send",
                status="error",
                account_id=role_account_map[role_id].id,
                target=str(target_chat_id),
                target_id=f"step #{step.id}",
                details={"error": str(e), "text": text_to_send},
                scenario_id=scenario_id
            )
            await session.commit()
            break

    for c in clients.values():
        try:
            await c.stop()
        except Exception:
            pass
