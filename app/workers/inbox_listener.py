import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import async_session
from app.models.models import Account
from app.services.inbox_service import sync_dialogs_for_account

logger = logging.getLogger(__name__)

_listeners_running = False
_listener_task: asyncio.Task = None

async def _run_inbox_live_sync():
    """
    Continuous real-time background sync loop.
    Iteratively checks active accounts for new incoming Telegram messages
    and broadcasts updates via WebSocket.
    """
    logger.info("Live real-time Inbox sync background daemon started")
    # Lazy import to avoid circular dependencies
    from app.workers.inbox_ws import broadcast_inbox_event

    while _listeners_running:
        try:
            async with async_session() as session:
                stmt = select(Account).where(
                    Account.is_active == True,
                    Account.session_string.isnot(None)
                ).options(selectinload(Account.proxy))
                accounts = (await session.execute(stmt)).scalars().all()
                account_ids = [acc.id for acc in accounts]

            for acc_id in account_ids:
                if not _listeners_running:
                    break
                try:
                    new_msgs = await sync_dialogs_for_account(acc_id, max_dialogs=15, max_messages=25)
                    if new_msgs > 0:
                        logger.info(f"Live sync imported {new_msgs} new messages for Account #{acc_id}")
                        await broadcast_inbox_event({
                            "event": "new_messages",
                            "account_id": acc_id,
                            "count": new_msgs
                        })
                except Exception as e:
                    logger.debug(f"Live sync error for Account #{acc_id}: {e}")

                await asyncio.sleep(1.5)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in inbox live sync loop: {e}", exc_info=True)

        await asyncio.sleep(3.0)

async def start_inbox_listeners():
    global _listeners_running, _listener_task
    if _listeners_running:
        return
    _listeners_running = True
    _listener_task = asyncio.create_task(_run_inbox_live_sync())
    logger.info("Inbox live sync task created")

async def stop_inbox_listeners():
    global _listeners_running, _listener_task
    _listeners_running = False
    if _listener_task:
        _listener_task.cancel()
        try:
            await _listener_task
        except asyncio.CancelledError:
            pass
        _listener_task = None
    logger.info("Inbox live sync task stopped")
