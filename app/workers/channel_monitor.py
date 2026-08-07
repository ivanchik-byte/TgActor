import asyncio
import logging
import random
from sqlalchemy import select
from app.core.database import async_session
from app.models.models import MonitoredChannel, Account
from app.telegram.client import get_hydrogram_client
from app.services.monitor_service import pick_random_scenario
from app.services.scenario_service import execute_scenario

logger = logging.getLogger(__name__)

_monitor_running = False
_monitor_task = None

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
                    client = get_hydrogram_client(sample_account, sample_account.proxy)
                    try:
                        await client.start()
                        for channel in channels:
                            try:
                                scenario = await pick_random_scenario(session, channel)
                                if scenario:
                                    delay = random.randint(channel.min_delay_seconds, channel.max_delay_seconds)
                                    logger.info(f"Monitor triggered for {channel.channel_username}, waiting {delay}s...")
                                    await asyncio.sleep(delay)
                                    await execute_scenario(session, scenario.id, channel.channel_username)
                            except Exception as ex:
                                logger.warning(f"Error monitoring channel {channel.channel_username}: {ex}")
                    finally:
                        await client.stop()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Channel monitor status notice: {e}")

        await asyncio.sleep(10)
