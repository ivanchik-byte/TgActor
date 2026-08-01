import logging
import random
import asyncio
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Scenario, ScenarioStep, TaskLog, Account
from pool_manager import get_commenting_pool, get_reaction_pool
from client import TelegramSessionClient
from preflight_checker import check_chat_availability

logger = logging.getLogger(__name__)

async def execute_scenario(
    session: AsyncSession, 
    scenario_id: int, 
    chat_id: int | str,
    discussion_message_id: Optional[int] = None
):
    """
    Executes a scenario in a specific chat.
    If discussion_message_id is provided, it means we are commenting under a specific post.
    """
    # 1. Fetch Scenario & Steps
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

    # 2. Extract Roles and Check Pool
    roles_needed = set(step.role_id for step in steps)
    commenting_pool = await get_commenting_pool(session)
    reaction_pool = await get_reaction_pool(session)
    
    if len(commenting_pool) < len(roles_needed):
        error_msg = f"NOT_ENOUGH_ACCOUNTS_IN_POOL: Требуется {len(roles_needed)} аккаунтов, доступно {len(commenting_pool)}"
        logger.error(error_msg)
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=error_msg)
        session.add(log)
        await session.commit()
        return

    # 3. Assign Accounts to Roles
    random.shuffle(commenting_pool)
    role_account_map: Dict[int, Account] = {}
    for role_id in roles_needed:
        role_account_map[role_id] = commenting_pool.pop()

    # 4. Initialize Clients
    clients: Dict[int, TelegramSessionClient] = {}
    for role_id, account in role_account_map.items():
        client = TelegramSessionClient(
            encrypted_session=account.encrypted_session,
        )
        try:
            await client.start()
            clients[role_id] = client
        except Exception as e:
            logger.error(f"Не удалось запустить клиент для аккаунта {account.id}: {e}")
            # If one fails, we should gracefully abort or reassign. Aborting for now.
            for c in clients.values():
                await c.stop()
            log = TaskLog(account_id=account.id, scenario_id=scenario_id, status="error", error_message=f"Init client failed: {e}")
            session.add(log)
            await session.commit()
            return

    # 5. Preflight Checker
    first_client = next(iter(clients.values()))
    requires_media = any(step.media_path for step in steps)
    
    is_available, error_msg = await check_chat_availability(first_client.client, chat_id, requires_media)
    if not is_available:
        logger.error(f"Preflight failed: {error_msg}")
        log = TaskLog(scenario_id=scenario_id, status="error", error_message=f"Preflight: {error_msg}")
        session.add(log)
        await session.commit()
        
        for c in clients.values():
            await c.stop()
        return

    # 6. Execute Steps
    step_msg_map: Dict[int, int] = {}
    
    for step in steps:
        role_id = step.role_id
        client = clients[role_id]
        
        delay_min = step.delay_before_min if step.delay_before_min is not None else scenario.min_delay
        delay_max = step.delay_before_max if step.delay_before_max is not None else scenario.max_delay
        
        reply_to = discussion_message_id
        if step.reply_to_step_id and step.reply_to_step_id in step_msg_map:
            reply_to = step_msg_map[step.reply_to_step_id]

        try:
            msg = await client.send_human_message(
                chat_id=chat_id,
                text=step.text or "",
                reply_to_message_id=reply_to,
                delay_range=(delay_min, delay_max)
            )
            
            if msg:
                # Hydrogram Message object has an 'id' attribute
                # In tests, it might be a mocked object
                msg_id = getattr(msg, 'id', None) or getattr(msg, 'message_id', 0)
                step_msg_map[step.id] = msg_id
                
                log = TaskLog(account_id=role_account_map[role_id].id, scenario_id=scenario_id, status="success")
                session.add(log)
                await session.commit()
                
                # Handle Reactions
                if step.reactions and reaction_pool:
                    # In DB it might be space separated string e.g. "👍 🔥"
                    reactions = step.reactions.split() 
                    count = step.reaction_count or 1
                    reactors = random.sample(reaction_pool, min(count, len(reaction_pool)))
                    
                    for r_acc in reactors:
                        r_client = TelegramSessionClient(encrypted_session=r_acc.encrypted_session)
                        try:
                            await r_client.start()
                            emoji = random.choice(reactions)
                            await asyncio.sleep(random.uniform(0.5, 2.0))
                            
                            # In Pyrogram/Hydrogram, send_reaction is on the Client class
                            await r_client.client.send_reaction(chat_id, msg_id, emoji)
                            logger.info(f"Аккаунт {r_acc.id} поставил реакцию {emoji}")
                        except Exception as e:
                            logger.error(f"Ошибка постановки реакции аккаунтом {r_acc.id}: {e}")
                        finally:
                            await r_client.stop()

        except Exception as e:
            logger.error(f"Ошибка на шаге {step.id}: {e}")
            log = TaskLog(account_id=role_account_map[role_id].id, scenario_id=scenario_id, status="error", error_message=str(e))
            session.add(log)
            await session.commit()
            break

    # Stop all clients
    for c in clients.values():
        try:
            await c.stop()
        except Exception:
            pass
