import os
import asyncio
import json
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text, select
import redis.asyncio as redis

from app.models.models import Account, InboxMessage
from app.core.security import encrypt_session
from hydrogram import enums

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

import pytest
from app.models.models import Base

from app.core.database import async_session, engine

async def test_inbox():
    if "ENCRYPTION_KEY" not in os.environ:
        from cryptography.fernet import Fernet
        os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode('utf-8')

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
        
    async with async_session() as session:
        dummy_session = encrypt_session("dummy")
        acc1 = Account(phone="+1", encrypted_session=dummy_session, source_type="tdata", status="active")
        session.add(acc1)
        await session.commit()
        await session.refresh(acc1)
        acc1_id = acc1.id

    from unittest.mock import AsyncMock, MagicMock
    from app.services.inbox_service import send_inbox_message, sync_dialogs_for_account
    import app.services.inbox_service as inbox_mod

    mock_client = MagicMock()
    mock_client.start = AsyncMock()
    mock_client.stop = AsyncMock()
    
    mock_sent_msg = MagicMock()
    mock_sent_msg.id = 999
    mock_sent_msg.caption = None
    mock_client.send_message = AsyncMock(return_value=mock_sent_msg)
    
    mock_chat = MagicMock()
    mock_chat.first_name = "Test"
    mock_chat.last_name = "User"
    mock_chat.title = None
    mock_chat.username = "test_user"
    mock_client.get_chat = AsyncMock(return_value=mock_chat)

    original_get_client = inbox_mod.get_hydrogram_client
    inbox_mod.get_hydrogram_client = MagicMock(return_value=mock_client)

    try:
        logger.info("--- Testing Outgoing DM ---")
        resp = await send_inbox_message(account_id=acc1_id, peer_id=123, text="Hello back!")
        assert resp["status"] in ["ok", "success"]

        logger.info("--- Checking Database ---")
        async with async_session() as session:
            msgs = (await session.execute(select(InboxMessage).order_by(InboxMessage.id))).scalars().all()
            assert len(msgs) == 1
            assert msgs[0].text == "Hello back!"
            assert msgs[0].incoming == False
            logger.info("DB Check Passed: Outgoing message saved correctly.")
    finally:
        inbox_mod.get_hydrogram_client = original_get_client

    logger.info("Integration test completed successfully!")

if __name__ == "__main__":
    asyncio.run(test_inbox())
