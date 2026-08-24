import os
import asyncio
import pytest
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text, select

from app.models.models import Base, Proxy, Account, Scenario, ScenarioStep, TaskLog
from app.services.scenario_service import execute_scenario
from app.core.security import encrypt_session

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./test_executor.db")

@pytest.mark.asyncio
async def test_engine():
    engine = create_async_engine(DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    if "ENCRYPTION_KEY" not in os.environ:
        from cryptography.fernet import Fernet
        os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode('utf-8')

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
        
    async with async_session() as session:
        # 1. Create Accounts
        dummy_session = encrypt_session("dummy")
        
        # We need 2 commenting accounts and 1 reaction account
        acc1 = Account(phone="+1", encrypted_session=dummy_session, source_type="tdata", in_commenting_pool=True)
        acc2 = Account(phone="+2", encrypted_session=dummy_session, source_type="tdata", in_commenting_pool=True)
        acc3 = Account(phone="+3", encrypted_session=dummy_session, source_type="tdata", in_reaction_pool=True)
        session.add_all([acc1, acc2, acc3])
        await session.commit()
        
        # 2. Create Scenario
        scenario = Scenario(title="Test Scenario")
        session.add(scenario)
        await session.commit()
        await session.refresh(scenario)
        
        # 3. Create Steps
        step1 = ScenarioStep(
            scenario_id=scenario.id, step_order=1, role_id=1, message_type="text", 
            text="Hello world!", delay_before_min=0.1, delay_before_max=0.2
        )
        session.add(step1)
        await session.commit()
        await session.refresh(step1)
        
        step2 = ScenarioStep(
            scenario_id=scenario.id, step_order=2, role_id=2, message_type="reply", 
            text="Hi there!", delay_before_min=0.1, delay_before_max=0.2,
            reply_to_step_id=step1.id, reactions="👍", reaction_count=1
        )
        session.add(step2)
        await session.commit()
        await session.refresh(step2)
        
        step3 = ScenarioStep(
            scenario_id=scenario.id, step_order=3, role_id=1, message_type="reply", 
            text="How are you?", delay_before_min=0.1, delay_before_max=0.2,
            reply_to_step_id=step2.id
        )
        session.add(step3)
        await session.commit()

    # MOCKING HYDROGRAM CLIENT
    from unittest.mock import AsyncMock, MagicMock
    import app.services.scenario_service as scenario_mod
    from hydrogram.enums import ChatType

    msg_counter = 100
    allow_media = True

    class MockChat:
        def __init__(self):
            self.type = ChatType.SUPERGROUP
            self.linked_chat = MagicMock(id=12345)
            self.permissions = type('MockPerms', (), {
                'can_send_messages': True, 
                'can_send_media_messages': allow_media
            })

    class MockClient:
        def __init__(self, acc):
            self.acc = acc
            self.start = AsyncMock()
            self.stop = AsyncMock()
            self.join_chat = AsyncMock()
            self.send_reaction = AsyncMock()
        async def get_chat(self, chat_id):
            return MockChat()
        async def send_message(self, chat_id, text, reply_to_message_id=None, **kwargs):
            nonlocal msg_counter
            msg_counter += 1
            return type('MockMsg', (), {'id': msg_counter})
        async def send_photo(self, chat_id, photo, caption=None, reply_to_message_id=None, **kwargs):
            nonlocal msg_counter
            msg_counter += 1
            return type('MockMsg', (), {'id': msg_counter})

    def mock_get_client(account, proxy=None):
        return MockClient(account)

    original_get_client = scenario_mod.get_hydrogram_client
    scenario_mod.get_hydrogram_client = mock_get_client

    try:
        logger.info("--- Testing Scenario Engine (Normal Execution) ---")
        async with async_session() as session:
            await execute_scenario(session, scenario_id=scenario.id, chat_id=12345)
            
            # Verify logs
            logs = (await session.execute(select(TaskLog).where(TaskLog.scenario_id == scenario.id).order_by(TaskLog.id))).scalars().all()
            assert len(logs) > 0
            latest_log = logs[-1]
            logger.info(f"TaskLog: status={latest_log.status}, acc={latest_log.account_id}, err={latest_log.error_message}")
            assert latest_log.status == "success"

        logger.info("\n--- Testing Preflight Media Block ---")
        allow_media = False
        async with async_session() as session:
            # Update step 3 to require media
            s3 = (await session.execute(select(ScenarioStep).where(ScenarioStep.step_order == 3))).scalar_one()
            s3.media_path = "/fake/path.jpg"
            await session.commit()
            
            # Execute again
            await execute_scenario(session, scenario_id=scenario.id, chat_id=12345)
            
            # Check logs for preflight error (the latest log)
            logs = (await session.execute(select(TaskLog).order_by(TaskLog.id.desc()))).scalars().first()
            logger.info(f"TaskLog: status={logs.status}, err={logs.error_message}")
            assert "медиа" in logs.error_message.lower() or "preflight" in logs.error_message.lower() or "отправка" in logs.error_message.lower()
            assert logs.status == "error"
            
        logger.info("\n--- Testing Pool Exhaustion ---")
        async with async_session() as session:
            # Reset media
            s3 = (await session.execute(select(ScenarioStep).where(ScenarioStep.step_order == 3))).scalar_one()
            s3.media_path = None
            # Deactivate accounts
            accs = (await session.execute(select(Account))).scalars().all()
            for acc in accs:
                acc.is_active = False
            await session.commit()
            
            await execute_scenario(session, scenario_id=scenario.id, chat_id=12345)
            
            logs = (await session.execute(select(TaskLog).order_by(TaskLog.id.desc()))).scalars().first()
            logger.info(f"TaskLog: status={logs.status}, err={logs.error_message}")
            assert "недостаточно" in logs.error_message.lower() or "забанены" in logs.error_message.lower() or "error" in logs.status.lower()
    finally:
        scenario_mod.get_hydrogram_client = original_get_client

    logger.info("\nIntegration test completed successfully!")

if __name__ == "__main__":
    asyncio.run(test_engine())
