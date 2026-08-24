import asyncio
import logging
import random
from typing import Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.orm import selectinload

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

# Keep strong references to spawned jobs so GC cannot reap them
_background_executions: set = set()


def _spawn_execution(coro) -> None:
    task = asyncio.create_task(coro)
    _background_executions.add(task)
    task.add_done_callback(_background_executions.discard)


async def run_first_comment_job(
    channel_id: int,
    ch_user: str,
    post_id: int,
    post_text: str,
    delay: int
):
    """Execute first comment sniping in its own session after the delay."""
    if delay > 0:
        await asyncio.sleep(delay)
    from app.services.first_comment_service import send_first_comment
    try:
        async with async_session() as session:
            channel = await session.get(MonitoredChannel, channel_id)
            if not channel:
                logger.warning(f"First comment job skipped: channel {ch_user} was deleted")
                return
            await send_first_comment(
                session=session,
                channel=channel,
                post_id=post_id,
                post_text=post_text
            )
    except Exception as e:
        logger.warning(f"First comment job failed for {ch_user}: {e}")


async def run_scenario_job(
    scenario_id: int,
    chat_id: Any,
    discussion_message_id: Optional[int],
    delay: int
):
    """Execute a scenario in its own session after the delay."""
    if delay > 0:
        await asyncio.sleep(delay)
    try:
        async with async_session() as session:
            await execute_scenario(session, scenario_id, chat_id, discussion_message_id=discussion_message_id)
    except Exception as e:
        logger.warning(f"Scenario job #{scenario_id} failed: {e}")

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

                accounts_stmt = (
                    select(Account)
                    .where(Account.is_active == True)
                    .options(selectinload(Account.proxy))
                )
                accounts = list((await session.execute(accounts_stmt)).scalars().all())

                if channels and accounts:
                    client = None
                    sample_account = None
                    for candidate_acc in accounts:
                        c = get_hydrogram_client(candidate_acc, candidate_acc.proxy)
                        try:
                            await c.start()
                            client = c
                            sample_account = candidate_acc
                            break
                        except Exception as e:
                            logger.warning(f"Аккаунт #{candidate_acc.id} (@{candidate_acc.username or candidate_acc.phone}) недоступен для мониторинга: {e}")
                            continue

                    if not client:
                        logger.warning("Мониторинг каналов: нет рабочих аккаунтов (все аккаунты заблокированы или сессии недействительны)")
                        await asyncio.sleep(15)
                        continue

                    try:
                        for channel in channels:
                            ch_user = channel.channel_username
                            try:
                                # Fetch latest post to avoid re-triggering on unchanged channels
                                latest_msg_id = None
                                latest_post_text = ""
                                try:
                                    async for msg in client.get_chat_history(ch_user, limit=1):
                                        latest_msg_id = msg.id
                                        latest_post_text = msg.text or msg.caption or ""
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

                                mode = getattr(channel, 'execution_mode', 'scenario') or 'scenario'
                                lo = channel.min_delay_seconds or 0
                                hi = max(channel.max_delay_seconds or 0, lo)
                                if mode == 'first_comment':
                                    delay = random.randint(lo, hi)
                                    logger.info(f"First comment sniper triggered for {ch_user} (msg #{latest_msg_id}) in {delay}s...")
                                    # Run in background with its own session so the
                                    # monitor loop keeps checking other channels
                                    _spawn_execution(run_first_comment_job(
                                        channel.id,
                                        ch_user,
                                        latest_msg_id or 0,
                                        latest_post_text,
                                        delay
                                    ))
                                else:
                                    scenario = await pick_random_scenario(session, channel)
                                    if scenario:
                                        delay = random.randint(lo, hi)
                                        logger.info(f"New post detected in {ch_user} (msg #{latest_msg_id}). Triggering scenario '{scenario.title}' in {delay}s...")
                                        await log_action(
                                            session,
                                            action_type="channel_monitor",
                                            status="ok",
                                            target=ch_user,
                                            target_id=f"msg #{latest_msg_id or 'new'} -> sc #{scenario.id}",
                                            details={
                                                "summary": f"Замечен новый пост #{latest_msg_id} в {ch_user}. Боты готовятся к сценарию '{scenario.title}' (задержка {delay}с)",
                                                "scenario_title": scenario.title,
                                                "delay_seconds": delay,
                                                "msg_id": latest_msg_id,
                                                "post_preview": latest_post_text[:250],
                                                "badge": "Новый пост"
                                            },
                                            scenario_id=scenario.id
                                        )
                                        _spawn_execution(run_scenario_job(
                                            scenario.id,
                                            ch_user,
                                            latest_msg_id,
                                            delay
                                        ))
                                    else:
                                        warning_msg = f"В канале {ch_user} вышел новый пост (msg #{latest_msg_id}), но нет активных сценариев с сообщениями для ответа."
                                        logger.warning(warning_msg)
                                        await log_action(
                                            session,
                                            action_type="channel_monitor",
                                            status="error",
                                            target=ch_user,
                                            target_id=f"Нет сценариев • {ch_user}",
                                            details={
                                                "summary": "Нет активных сценариев с шагами",
                                                "category": "no_scenarios",
                                                "badge": "Нет сценария",
                                                "error": warning_msg,
                                                "msg_id": latest_msg_id
                                            }
                                        )
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
