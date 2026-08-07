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
    Ensures database tables and columns are aligned across PostgreSQL and SQLite.
    Runs on FastAPI startup before any background workers start.
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
            if "postgresql" in DATABASE_URL.lower():
                queries = [
                    # Fix accounts table: session_string, pool_type, custom_name, position
                    """
                    DO $$
                    BEGIN
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='encrypted_session')
                           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='session_string') THEN
                            ALTER TABLE accounts RENAME COLUMN encrypted_session TO session_string;
                        ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='session_string') THEN
                            ALTER TABLE accounts ADD COLUMN session_string TEXT;
                        END IF;

                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='is_active') THEN
                            ALTER TABLE accounts ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
                        END IF;

                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='pool_type') THEN
                            ALTER TABLE accounts ADD COLUMN pool_type VARCHAR(50) DEFAULT 'commenting';
                        END IF;

                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='custom_name') THEN
                            ALTER TABLE accounts ADD COLUMN custom_name VARCHAR(100);
                        END IF;

                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='position') THEN
                            ALTER TABLE accounts ADD COLUMN position INT DEFAULT 0;
                        END IF;
                    END $$;
                    """,
                    # Fix monitored_channels table: channel_username, history_json
                    """
                    DO $$
                    BEGIN
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitored_channels' AND column_name='channel_identifier')
                           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitored_channels' AND column_name='channel_username') THEN
                            ALTER TABLE monitored_channels RENAME COLUMN channel_identifier TO channel_username;
                        ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitored_channels' AND column_name='channel_username') THEN
                            ALTER TABLE monitored_channels ADD COLUMN channel_username VARCHAR(255);
                        END IF;

                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitored_channels' AND column_name='history_json') THEN
                            ALTER TABLE monitored_channels ADD COLUMN history_json TEXT DEFAULT '[]';
                        END IF;
                    END $$;
                    """,
                    # Fix scenario_steps table: reaction_source, reaction_roles
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scenario_steps' AND column_name='reaction_source') THEN
                            ALTER TABLE scenario_steps ADD COLUMN reaction_source VARCHAR(50) DEFAULT 'pool';
                        END IF;

                        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scenario_steps' AND column_name='reaction_roles') THEN
                            ALTER TABLE scenario_steps ADD COLUMN reaction_roles VARCHAR(255);
                        END IF;
                    END $$;
                    """,
                    # Fix proxies table: ip -> host
                    """
                    DO $$
                    BEGIN
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proxies' AND column_name='ip')
                           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proxies' AND column_name='host') THEN
                            ALTER TABLE proxies RENAME COLUMN ip TO host;
                        ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proxies' AND column_name='host') THEN
                            ALTER TABLE proxies ADD COLUMN host VARCHAR(255);
                        END IF;
                    END $$;
                    """
                ]
                for q in queries:
                    await conn.execute(text(q))
    except Exception as ex:
        logger.warning(f"Database schema sync note: {ex}")
