import os
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import redis.asyncio as aioredis
from app.core.config import DATABASE_URL, REDIS_URL

logger = logging.getLogger(__name__)

Base = declarative_base()

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)

async def ensure_db_schema_sync():
    """
    Ensures database tables are created and missing AI columns are added on startup.
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
            # Auto-migrate missing columns for existing PostgreSQL/SQLite tables
            migrations = [
                "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS mode VARCHAR DEFAULT 'manual'",
                "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS ai_prompt VARCHAR",
                "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS ai_provider VARCHAR",
                "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS ai_model VARCHAR",
                "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS system_instruction VARCHAR",
                "ALTER TABLE scenario_steps ADD COLUMN IF NOT EXISTS is_ai_dynamic BOOLEAN DEFAULT FALSE",
                "ALTER TABLE scenario_steps ADD COLUMN IF NOT EXISTS ai_prompt VARCHAR",
            ]
            for stmt in migrations:
                try:
                    await conn.execute(text(stmt))
                except Exception as m_ex:
                    logger.debug(f"Migration note for '{stmt}': {m_ex}")
    except Exception as ex:
        logger.warning(f"Database schema init note: {ex}")
