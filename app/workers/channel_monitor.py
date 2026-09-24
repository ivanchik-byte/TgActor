import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any, Optional
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

_job_sem = asyncio.Semaphore(3)
_background_executions: set = set()


def _spawn_execution(coro) -> None:
    async def _guarded():
        async with _job_sem:
            await coro
    task = asyncio.create_task(_guarded())
    _background_executions.add(task)
    task.add_done_callback(_background_executions.discard)


async def run_first_comment_job(
    channel_id: int,
    ch_user: str,
    post_id: int,
    post_text: str,
    delay: int
):
    if delay > 0:
        await asyncio.sleep(delay)
    from app.services.first_comment_service import send_first_comment
    try:
        async with async_session() as session:
            channel = await session.get(MonitoredChannel, channel_id)
            if not channel or not channel.is_active:
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
    delay: int,
    channel_id: Optional[int] = None,
):
    if delay > 0:
        await asyncio.sleep(delay)
    try:
        async with async_session() as session:
            if channel_id is not None:
                channel = await session.get(MonitoredChannel, channel_id)
                if not channel or not channel.is_active:
                    return
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
        try:
            await _monitor_task
        except asyncio.CancelledError:
            pass
        _monitor_task = None
    for task in list(_background_executions):
        task.cancel()
    logger.info("Channel monitor daemon stopped")




async def _recent_posts(client, ch_user: str, limit: int = 10):
    posts = []
    async for msg in client.get_chat_history(ch_user, limit=limit):
        posts.append((msg.id, msg.text or msg.caption or ""))
    posts.sort(key=lambda p: p[0])
    return posts

async def run_channel_monitor():
    while _monitor_running:
        try:
            async with async_session() as session:
                channels = list((await session.execute(
                    select(MonitoredChannel).where(MonitoredChannel.is_active == True)
                )).scalars().all())
                accounts = list((await session.execute(
                    select(Account)
                    .where(Account.is_active == True)
                    .options(selectinload(Account.proxy))
                )).scalars().all())
                for acc in accounts:
                    session.expunge(acc)
                    if acc.proxy is not None:
                        try:
                            session.expunge(acc.proxy)
                        except Exception:
                            pass
                channel_rows = [
                    (c.id, c.channel_username, c.last_checked_msg_id,
                     c.execution_mode, c.min_delay_seconds, c.max_delay_seconds)
                    for c in channels
                ]

            if channel_rows and accounts:
                client = None
                for candidate_acc in accounts:
                    c = get_hydrogram_client(candidate_acc, candidate_acc.proxy)
                    try:
                        await c.start()
                        client = c
                        break
                    except Exception as e:
                        logger.warning(f"Аккаунт #{candidate_acc.id} недоступен для мониторинга: {e}")
                        continue

                if not client:
                    logger.warning("Мониторинг каналов: нет рабочих аккаунтов")
                    await asyncio.sleep(15)
                    continue

                try:
                    for channel_id, ch_user, stored, mode, lo, hi in channel_rows:
                        try:
                            try:
                                posts = await _recent_posts(client, ch_user)
                            except Exception:
                                continue
                            if not posts:
                                continue
                            latest_id, latest_text = posts[-1]
                            if stored is None:
                                async with async_session() as session:
                                    channel = await session.get(MonitoredChannel, channel_id)
                                    if channel:
                                        channel.last_checked_msg_id = latest_id
                                        channel.last_checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
                                        await session.commit()
                                continue
                            pending = [(pid, text) for pid, text in posts if pid > stored]
                            if not pending:
                                continue
                            async with async_session() as session:
                                channel = await session.get(MonitoredChannel, channel_id)
                                if channel:
                                    channel.last_checked_msg_id = latest_id
                                    channel.last_checked_at = datetime.now(timezone.utc).replace(tzinfo=None)
                                    await session.commit()
                            lo_v = lo or 0
                            hi_v = max(hi or 0, lo_v)
                            for pid, text in pending[-3:]:
                                delay = random.randint(lo_v, hi_v)
                                if (mode or 'scenario') == 'first_comment':
                                    _spawn_execution(run_first_comment_job(
                                        channel_id, ch_user, pid, text, delay
                                    ))
                                else:
                                    async with async_session() as session:
                                        channel = await session.get(MonitoredChannel, channel_id)
                                        scenario = await pick_random_scenario(session, channel) if channel else None
                                        scenario_id = scenario.id if scenario else None
                                        scenario_title = scenario.title if scenario else ""
                                    if scenario_id:
                                        await _log_trigger(ch_user, pid, text, scenario_id, scenario_title, delay)
                                        _spawn_execution(run_scenario_job(
                                            scenario_id, ch_user, pid, delay, channel_id
                                        ))
                                    else:
                                        await _log_empty(ch_user, pid)
                        except Exception as ex:
                            diag = classify_telegram_error(ex)
                            logger.warning(f"Error monitoring channel {ch_user} ({diag['badge']}): {ex}")
                finally:
                    await client.stop()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Channel monitor status notice: {e}")

        await asyncio.sleep(15)


async def _log_trigger(ch_user, msg_id, text, scenario_id, title, delay):
    async with async_session() as session:
        await log_action(
            session,
            action_type="channel_monitor",
            status="ok",
            target=ch_user,
            target_id=f"msg #{msg_id} -> sc #{scenario_id}",
            details={
                "summary": f"Замечен новый пост #{msg_id} в {ch_user}. Сценарий '{title}' (задержка {delay}с)",
                "scenario_title": title,
                "delay_seconds": delay,
                "msg_id": msg_id,
                "post_preview": (text or "")[:250],
                "badge": "Новый пост"
            },
            scenario_id=scenario_id
        )


async def _log_empty(ch_user, msg_id):
    async with async_session() as session:
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
                "msg_id": msg_id
            }
        )
