import os
import logging
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
    Ensures database tables are created on startup.
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as ex:
        logger.warning(f"Database schema init note: {ex}")
