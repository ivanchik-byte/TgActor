import os
import asyncio
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text, select

from models import Base, Proxy, Account, Scenario, ScenarioStep, TaskLog
from scenario_executor import execute_scenario
from security import encrypt_session

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DB_URL = "postgresql+asyncpg://tgcast:tgcast_password@localhost:5433/tgcast_db"

async def test_engine():
    engine = create_async_engine(DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    if "ENCRYPTION_KEY" not in os.environ:
        from cryptography.fernet import Fernet
        os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode('utf-8')

    async with async_session() as session:
        # Clear previous data
        await session.execute(text("TRUNCATE TABLE task_logs, scenario_steps, scenarios, accounts, proxies RESTART IDENTITY CASCADE;"))
        await session.commit()
        
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
    from client import TelegramSessionClient
    
    msg_counter = 100
    
    async def mock_start(self):
        logger.info(f"MOCK API: start client")
        class MockClient:
            async def get_chat(self, chat_id):
                class MockChat:
                    def __init__(self):
                        self.type = type('MockType', (), {'CHANNEL': 'channel'})
                        self.linked_chat = True
                        self.permissions = type('MockPerms', (), {'can_send_messages': True, 'can_send_media_messages': False})
                return MockChat()
                
            async def send_reaction(self, chat_id, msg_id, emoji):
                logger.info(f"MOCK API: Reacting {emoji} to message {msg_id}")
                
        self.client = MockClient()
        self.status = "active"

    async def mock_stop(self):
        pass

    async def mock_send(self, chat_id, text, reply_to_message_id=None, delay_range=None):
        nonlocal msg_counter
        msg_counter += 1
        logger.info(f"MOCK API: Send message '{text}', reply_to={reply_to_message_id} -> assigned ID {msg_counter}")
        class MockMsg:
            def __init__(self, id):
                self.id = id
        return MockMsg(msg_counter)

    TelegramSessionClient.start = mock_start
    TelegramSessionClient.stop = mock_stop
    TelegramSessionClient.send_human_message = mock_send

    logger.info("--- Testing Scenario Engine (Normal Execution) ---")
    async with async_session() as session:
        await execute_scenario(session, scenario_id=scenario.id, chat_id=12345)
        
        # Verify logs
        logs = (await session.execute(select(TaskLog).order_by(TaskLog.id))).scalars().all()
        for log in logs:
            logger.info(f"TaskLog: status={log.status}, acc={log.account_id}, err={log.error_message}")
            assert log.status == "success"

    logger.info("\n--- Testing Preflight Media Block ---")
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
        assert "Preflight" in logs.error_message
        assert logs.status == "error"
        
    logger.info("\n--- Testing Pool Exhaustion ---")
    async with async_session() as session:
        # Remove an account from commenting pool
        acc1 = (await session.execute(select(Account).where(Account.phone == "+1"))).scalar_one()
        acc1.in_commenting_pool = False
        await session.commit()
        
        await execute_scenario(session, scenario_id=scenario.id, chat_id=12345)
        
        logs = (await session.execute(select(TaskLog).order_by(TaskLog.id.desc()))).scalars().first()
        logger.info(f"TaskLog: status={logs.status}, err={logs.error_message}")
        assert "NOT_ENOUGH_ACCOUNTS" in logs.error_message

    logger.info("\nIntegration test completed successfully!")

if __name__ == "__main__":
    asyncio.run(test_engine())
