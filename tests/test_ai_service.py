import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base, ensure_db_schema_sync
from app.services.ai_service import get_ai_settings

@pytest.mark.asyncio
async def test_ai_settings_default():
    """Test retrieving default AI settings."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        settings = await get_ai_settings(session)
        assert "provider" in settings
        assert settings["provider"] == "openai"
        assert settings["default_model"] == "gpt-4o-mini"

    await engine.dispose()

@pytest.mark.asyncio
async def test_db_schema_sync():
    """Test auto-migration of missing AI schema columns."""
    await ensure_db_schema_sync()
