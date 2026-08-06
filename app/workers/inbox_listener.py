import asyncio
import logging
from sqlalchemy import select
from app.core.database import async_session
from app.models.models import Account

logger = logging.getLogger(__name__)

_listeners_running = False

async def start_inbox_listeners():
    global _listeners_running
    _listeners_running = True
    logger.info("Inbox listeners initialized")

async def stop_inbox_listeners():
    global _listeners_running
    _listeners_running = False
    logger.info("Inbox listeners stopped")
