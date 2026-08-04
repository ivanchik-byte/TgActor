"""
Channel Monitor — фоновый воркер, который слушает каналы из списка
и при появлении нового поста запускает случайный сценарий в комментариях.

Features:
- Weighted random scenario selection (Scenario.weight)
- Anti-repeat: tracks last N scenario IDs per channel
- Configurable random delay before execution
- Auto-join discussion groups
"""

import json
import random
import asyncio
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import MonitoredChannel, Scenario, Account
from inbox_listener import async_session
from client import TelegramSessionClient

logger = logging.getLogger(__name__)

_monitor_task: Optional[asyncio.Task] = None
_should_stop = False


def is_monitor_running() -> bool:
    return _monitor_task is not None and not _monitor_task.done()


async def stop_monitor():
    global _should_stop, _monitor_task
    _should_stop = True
    if _monitor_task and not _monitor_task.done():
        _monitor_task.cancel()
        try:
            await _monitor_task
        except asyncio.CancelledError:
            pass
    _monitor_task = None
    logger.info("Channel monitor stopped.")


async def _pick_random_scenario(session, channel: MonitoredChannel) -> Optional[int]:
    """
    Pick a random active scenario weighted by Scenario.weight.
    Respects no_repeat_scenarios: won't pick a scenario that was recently used on this channel.
    """
    result = await session.execute(
        select(Scenario).where(Scenario.is_active == True)
    )
    scenarios = list(result.scalars().all())
    
    if not scenarios:
        return None
    
    # Filter out recently used if no_repeat is on
    if channel.no_repeat_scenarios and channel.last_scenario_ids_json:
        try:
            used_ids = set(json.loads(channel.last_scenario_ids_json))
        except (json.JSONDecodeError, TypeError):
            used_ids = set()
        
        filtered = [s for s in scenarios if s.id not in used_ids]
        
        # If all scenarios have been used, reset history and use full list
        if not filtered:
            channel.last_scenario_ids_json = "[]"
            filtered = scenarios
        
        scenarios = filtered
    
    # Weighted random selection
    weights = [s.weight for s in scenarios]
    chosen = random.choices(scenarios, weights=weights, k=1)[0]
    
    # Update history
    try:
        history = json.loads(channel.last_scenario_ids_json or "[]")
    except (json.JSONDecodeError, TypeError):
        history = []
    
    history.append(chosen.id)
    # Keep only last N entries (N = total number of active scenarios to allow full rotation)
    max_history = max(len(scenarios), 5)
    if len(history) > max_history:
        history = history[-max_history:]
    
    channel.last_scenario_ids_json = json.dumps(history)
    await session.commit()
    
    return chosen.id


def _get_monitor_account_proxy(account) -> Optional[dict]:
    """Build proxy dict for the monitor account."""
    if not account.proxy or getattr(account.proxy, 'status', None) != 'active':
        return None
    p = account.proxy
    return {
        "scheme": p.protocol.lower(),
        "hostname": p.ip,
        "port": p.port,
        "username": p.username,
        "password": p.password
    }


async def start_monitor():
    """
    Main monitor loop:
    1. Pick a monitor account (first active account with in_commenting_pool)
    2. Subscribe to updates from all monitored channels
    3. On new channel post → random delay → pick scenario → execute
    """
    global _monitor_task, _should_stop
    _should_stop = False
    
    async def _run():
        global _should_stop
        
        while not _should_stop:
            try:
                # Get a monitor account
                async with async_session() as session:
                    result = await session.execute(
                        select(Account)
                        .options(selectinload(Account.proxy))
                        .where(Account.status == "active")
                        .limit(1)
                    )
                    monitor_account = result.scalar_one_or_none()
                
                if not monitor_account:
                    logger.warning("Channel monitor: no active accounts available. Retrying in 30s...")
                    await asyncio.sleep(30)
                    continue
                
                proxy_dict = _get_monitor_account_proxy(monitor_account)
                client = TelegramSessionClient(
                    encrypted_session=monitor_account.encrypted_session,
                    proxy=proxy_dict
                )
                
                try:
                    await client.start()
                    logger.info(f"Channel monitor started with account #{monitor_account.id}")
                except Exception as e:
                    logger.error(f"Channel monitor: failed to start client: {e}")
                    await asyncio.sleep(30)
                    continue
                
                # Set up new message handler for channel posts
                from hydrogram import filters
                from hydrogram.handlers import MessageHandler
                
                async def on_new_channel_post(tg_client, message):
                    """Handler for new posts in monitored channels."""
                    if _should_stop:
                        return
                    
                    # Only handle channel posts (not edits, not service messages)
                    if not message.chat or message.chat.type.value not in ("channel",):
                        return
                    
                    chat_id = message.chat.id
                    chat_username = message.chat.username
                    
                    # Check if this channel is in our monitored list
                    async with async_session() as session:
                        result = await session.execute(
                            select(MonitoredChannel).where(MonitoredChannel.is_active == True)
                        )
                        channels = list(result.scalars().all())
                    
                    matched_channel = None
                    for ch in channels:
                        ident = ch.channel_identifier.lstrip("@").lower()
                        if chat_username and ident == chat_username.lower():
                            matched_channel = ch
                            break
                        try:
                            if str(chat_id) == ident or str(chat_id) == ch.channel_identifier:
                                matched_channel = ch
                                break
                        except ValueError:
                            pass
                    
                    if not matched_channel:
                        return
                    
                    post_id = message.id
                    logger.info(f"Channel monitor: new post #{post_id} in {matched_channel.channel_identifier}")
                    
                    # Random delay before executing
                    delay = random.uniform(
                        matched_channel.min_delay_seconds,
                        matched_channel.max_delay_seconds
                    )
                    logger.info(f"Channel monitor: waiting {delay:.0f}s before executing scenario...")
                    await asyncio.sleep(delay)
                    
                    if _should_stop:
                        return
                    
                    # Pick random scenario
                    async with async_session() as session:
                        # Re-fetch channel to update history
                        ch = await session.get(MonitoredChannel, matched_channel.id)
                        if not ch or not ch.is_active:
                            return
                        
                        scenario_id = await _pick_random_scenario(session, ch)
                    
                    if not scenario_id:
                        logger.warning("Channel monitor: no active scenarios available.")
                        return
                    
                    # Execute scenario
                    logger.info(f"Channel monitor: executing scenario #{scenario_id} for post #{post_id} in {matched_channel.channel_identifier}")
                    try:
                        from scenario_executor import execute_scenario
                        async with async_session() as session:
                            target = matched_channel.channel_identifier
                            await execute_scenario(session, scenario_id, target, post_id)
                        logger.info(f"Channel monitor: scenario #{scenario_id} completed for post #{post_id}")
                    except Exception as e:
                        logger.error(f"Channel monitor: scenario execution failed: {e}")
                
                # Register handler
                client.client.add_handler(MessageHandler(on_new_channel_post, filters.channel))
                
                # Join all monitored channels to receive updates
                async with async_session() as session:
                    result = await session.execute(
                        select(MonitoredChannel).where(MonitoredChannel.is_active == True)
                    )
                    channels = list(result.scalars().all())
                
                for ch in channels:
                    try:
                        ident = ch.channel_identifier
                        await client.client.join_chat(ident)
                        logger.info(f"Channel monitor: joined {ident}")
                    except Exception as e:
                        logger.warning(f"Channel monitor: could not join {ident}: {e}")
                
                logger.info(f"Channel monitor: watching {len(channels)} channel(s). Waiting for new posts...")
                
                # Keep alive until stopped
                while not _should_stop:
                    await asyncio.sleep(5)
                
                # Cleanup
                await client.stop()
                logger.info("Channel monitor client stopped.")
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Channel monitor error: {e}")
                await asyncio.sleep(30)
    
    _monitor_task = asyncio.create_task(_run())
    return _monitor_task
