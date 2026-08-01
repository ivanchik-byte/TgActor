import os
import asyncio
import json
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text, select
import redis.asyncio as redis

from models import Account, InboxMessage
from security import encrypt_session
from hydrogram import enums

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DB_URL = "postgresql+asyncpg://tgcast:tgcast_password@localhost:5433/tgcast_db"
REDIS_URL = "redis://localhost:6380/0"

async def test_inbox():
    engine = create_async_engine(DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    if "ENCRYPTION_KEY" not in os.environ:
        from cryptography.fernet import Fernet
        os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode('utf-8')

    async with async_session() as session:
        await session.execute(text("TRUNCATE TABLE task_logs, scenario_steps, scenarios, accounts, proxies, inbox_messages RESTART IDENTITY CASCADE;"))
        await session.commit()
        
        dummy_session = encrypt_session("dummy")
        acc1 = Account(phone="+1", encrypted_session=dummy_session, source_type="tdata", status="active")
        session.add(acc1)
        await session.commit()
        await session.refresh(acc1)
        acc1_id = acc1.id

    # Mock TelegramSessionClient
    from client import TelegramSessionClient
    
    mock_handler = None
    mock_client_instance = None
    
    async def mock_start(self):
        logger.info(f"MOCK API: start client")
        class MockClient:
            def on_message(self, filters):
                def decorator(func):
                    nonlocal mock_handler
                    mock_handler = func
                    return func
                return decorator
            
            async def send_message(self, chat_id, text):
                logger.info(f"MOCK API: Sent DM to {chat_id}: {text}")
                class MockMsg:
                    def __init__(self):
                        self.id = 999
                return MockMsg()
                
        self.client = MockClient()
        self.status = "active"
        nonlocal mock_client_instance
        mock_client_instance = self

    async def mock_stop(self):
        pass

    TelegramSessionClient.start = mock_start
    TelegramSessionClient.stop = mock_stop

    from inbox_listener import start_listeners, stop_listeners, active_clients
    from inbox_ws import send_direct_message, SendMessageRequest
    
    # Start listeners manually
    await start_listeners()
    
    # Setup Redis Subscriber
    redis_client = redis.from_url(REDIS_URL)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("inbox_events")

    try:
        logger.info("--- Triggering Fake Incoming DM ---")
        class FakeChat:
            type = enums.ChatType.PRIVATE
            id = 123
        class FakeUser:
            id = 123
            username = "test_user"
        class FakeMsg:
            id = 1
            chat = FakeChat()
            from_user = FakeUser()
            text = "Hello from DM!"
            caption = None
            date = None
        
        # Fire handler
        await mock_handler(mock_client_instance.client, FakeMsg())
        
        # Check Redis Event
        message = None
        while message is None or message["type"] != "message":
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            
        payload = json.loads(message["data"])
        logger.info(f"Redis Received Incoming: {payload}")
        assert payload["text"] == "Hello from DM!"
        assert payload["is_incoming"] == True
        
        logger.info("--- Testing Outgoing DM ---")
        req = SendMessageRequest(account_id=acc1_id, peer_id=123, text="Hello back!")
        resp = await send_direct_message(req)
        assert resp["status"] == "success"
        
        # Check Redis Event
        message = None
        while message is None or message["type"] != "message":
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            
        payload2 = json.loads(message["data"])
        logger.info(f"Redis Received Outgoing: {payload2}")
        assert payload2["text"] == "Hello back!"
        assert payload2["is_incoming"] == False

        logger.info("--- Checking Database ---")
        async with async_session() as session:
            msgs = (await session.execute(select(InboxMessage).order_by(InboxMessage.id))).scalars().all()
            assert len(msgs) == 2
            assert msgs[0].text == "Hello from DM!"
            assert msgs[0].is_incoming == True
            assert msgs[1].text == "Hello back!"
            assert msgs[1].is_incoming == False
            logger.info("DB Check Passed: Both messages saved correctly.")

    finally:
        await stop_listeners()
        await pubsub.unsubscribe()
        await pubsub.aclose()
        await redis_client.aclose()

    logger.info("Integration test completed successfully!")

if __name__ == "__main__":
    asyncio.run(test_inbox())
