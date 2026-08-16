import asyncio
import logging
import random
from typing import Dict, Any, Optional
from sqlalchemy import select

from app.core.database import async_session
from app.models.models import MonitoredChannel, Account
from app.services.monitor_service import pick_random_scenario
from app.services.scenario_service import execute_scenario
from app.telegram.client import get_hydrogram_client
from app.services.log_service import log_action, classify_telegram_error

logger = logging.getLogger(__name__)

_monitor_running = False
_monitor_task = None
_last_checked_msg_id: Dict[str, int] = {}

def is_monitor_running() -> bool:
    return _monitor_running

async def start_channel_monitor():
    global _monitor_running, _monitor_task
    if _monitor_running:
        return
    _monitor_running = True
    _monitor_task = asyncio.create_task(run_channel_monitor())
    logger.info("Channel monitor daemon started")

async def stop_channel_monitor():
    global _monitor_running, _monitor_task
    _monitor_running = False
    if _monitor_task:
        _monitor_task.cancel()
        _monitor_task = None
    logger.info("Channel monitor daemon stopped")

async def run_channel_monitor():
    while _monitor_running:
        try:
            async with async_session() as session:
                channels_stmt = select(MonitoredChannel).where(MonitoredChannel.is_active == True)
                channels = list((await session.execute(channels_stmt)).scalars().all())
                
                accounts_stmt = select(Account).where(Account.is_active == True)
                accounts = list((await session.execute(accounts_stmt)).scalars().all())

                if channels and accounts:
                    sample_account = accounts[0]
                    client = get_hydrogram_client(sample_account, getattr(sample_account, 'proxy', None))
                    try:
                        await client.start()
                        for channel in channels:
                            ch_user = channel.channel_username
                            try:
                                # Fetch latest post to avoid re-triggering on unchanged channels
                                latest_msg_id = None
                                try:
                                    async for msg in client.get_chat_history(ch_user, limit=1):
                                        latest_msg_id = msg.id
                                        break
                                except Exception:
                                    latest_msg_id = None

                                # Check if already processed or establishing initial baseline
                                if latest_msg_id is not None:
                                    if ch_user not in _last_checked_msg_id:
                                        # First run after start/restart: record baseline post ID without spamming
                                        _last_checked_msg_id[ch_user] = latest_msg_id
                                        logger.info(f"Channel monitor: initialized baseline for {ch_user} at msg #{latest_msg_id}")
                                        continue

                                    if latest_msg_id <= _last_checked_msg_id[ch_user]:
                                        # No genuinely new post, skip to avoid spamming
                                        continue

                                    # Genuinely new post detected!
                                    _last_checked_msg_id[ch_user] = latest_msg_id

                                scenario = await pick_random_scenario(session, channel)
                                if scenario:
                                    delay = random.randint(channel.min_delay_seconds, channel.max_delay_seconds)
                                    logger.info(f"New post detected in {ch_user} (msg #{latest_msg_id}). Triggering scenario '{scenario.title}' in {delay}s...")
                                    await log_action(
                                        session,
                                        action_type="channel_monitor",
                                        status="ok",
                                        target=ch_user,
                                        target_id=f"msg #{latest_msg_id or 'new'} -> sc #{scenario.id}",
                                        details={"scenario_title": scenario.title, "delay_seconds": delay, "msg_id": latest_msg_id},
                                        scenario_id=scenario.id
                                    )
                                    await asyncio.sleep(delay)
                                    await execute_scenario(session, scenario.id, ch_user, discussion_message_id=latest_msg_id)
                            except Exception as ex:
                                diag = classify_telegram_error(ex)
                                logger.warning(f"Error monitoring channel {ch_user} ({diag['badge']}): {ex}")
                                await log_action(
                                    session,
                                    action_type="channel_monitor",
                                    status="error",
                                    target=ch_user,
                                    target_id=f"{diag['badge']} • {ch_user}",
                                    details={
                                        "summary": diag["summary"],
                                        "category": diag["category"],
                                        "badge": diag["badge"],
                                        "error": str(ex)
                                    }
                                )
                    finally:
                        await client.stop()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Channel monitor status notice: {e}")

        await asyncio.sleep(15)
