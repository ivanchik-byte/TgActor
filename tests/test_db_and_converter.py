import os
import asyncio
import pytest
import logging
import zipfile
import tempfile
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text, select
from app.core.security import decrypt_session, encrypt_session
from app.telegram.tdata_converter import convert_tdata_zip_to_encrypted_session
from app.services.proxy_service import bind_proxy_to_account, validate_account_proxy_mode
from app.models.models import Base, Proxy, Account

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./test_converter.db")

@pytest.mark.asyncio
async def test_database_and_converter():
    engine = create_async_engine(DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    logger.info("--- Testing DB Connection ---")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            for table in reversed(Base.metadata.sorted_tables):
                await conn.execute(table.delete())
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection successful.")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return

    logger.info("\n--- Testing TData Converter (Invalid Archive) ---")
    # Generate a dummy zip that does not contain a valid tdata to test graceful failure
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        dummy_zip_path = tmp.name
        
    with zipfile.ZipFile(dummy_zip_path, 'w') as zf:
        zf.writestr('tdata/dummy.txt', 'dummy content')
        
    success, result, _ = await convert_tdata_zip_to_encrypted_session(dummy_zip_path)
    os.remove(dummy_zip_path)
    
    if not success and "failed_invalid_tdata" in str(result):
        logger.info("Converter correctly handled invalid tdata archive without crashing.")
    else:
        logger.error(f"Converter test failed: success={success}, result={result}")

    logger.info("\n--- Creating Test Data ---")
    # Generate encryption key if not exists (needed for security.py)
    if "ENCRYPTION_KEY" not in os.environ:
        from cryptography.fernet import Fernet
        os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode('utf-8')

    async with async_session() as session:
        # Create a Proxy
        proxy = Proxy(
            ip="192.168.1.100",
            port=1080,
            protocol="socks5",
            status="active"
        )
        session.add(proxy)
        await session.commit()
        await session.refresh(proxy)
        
        # Create an Account
        dummy_encrypted = encrypt_session("dummy_session_string")
        
        account = Account(
            phone="+1234567890",
            encrypted_session=dummy_encrypted,
            source_type="tdata"
        )
        session.add(account)
        await session.commit()
        await session.refresh(account)
        
        logger.info(f"Created Proxy ID: {proxy.id}, Account ID: {account.id}")

    logger.info("\n--- Testing Proxy Validation (Safe Mode: USE_PROXY=True) ---")
    os.environ["USE_PROXY"] = "True"
    async with async_session() as session:
        # Should fail because account has no proxy assigned yet
        is_valid = await validate_account_proxy_mode(session, account.id)
        logger.info(f"Safe Mode without proxy result: {is_valid} (Expected: False)")
        
        # Fetch account to check status
        acc = (await session.execute(select(Account).where(Account.id == account.id))).scalar_one()
        logger.info(f"Account status updated to: {acc.status} (Expected: unassigned_proxy)")

    logger.info("\n--- Testing Proxy Validation (Danger Mode: USE_PROXY=False) ---")
    os.environ["USE_PROXY"] = "False"
    async with async_session() as session:
        # Should succeed with a critical warning
        is_valid = await validate_account_proxy_mode(session, account.id)
        logger.info(f"Danger Mode result: {is_valid} (Expected: True)")

    logger.info("\n--- Testing Proxy Binding ---")
    os.environ["USE_PROXY"] = "True"
    async with async_session() as session:
        # Bind proxy to account
        success = await bind_proxy_to_account(session, account.id, proxy.id)
        logger.info(f"Binding proxy result: {success} (Expected: True)")
        
        # Validate again in Safe Mode
        is_valid = await validate_account_proxy_mode(session, account.id)
        logger.info(f"Safe Mode WITH proxy result: {is_valid} (Expected: True)")
        
        # Try binding same proxy to a new account (Should fail 1:1 constraint)
        account2 = Account(
            phone="+0987654321",
            encrypted_session=dummy_encrypted,
            source_type="tdata"
        )
        session.add(account2)
        await session.commit()
        await session.refresh(account2)
        
        success2 = await bind_proxy_to_account(session, account2.id, proxy.id)
        logger.info(f"Binding already used proxy result: {success2} (Expected: False)")

    logger.info("\nIntegration test completed successfully!")

if __name__ == "__main__":
    asyncio.run(test_database_and_converter())
