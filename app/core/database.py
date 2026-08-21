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
            
            is_postgres = engine.dialect.name == "postgresql"
            
            # Common migrations (ALTER TABLE ADD COLUMN, UPDATE)
            common_migrations = [
                "ALTER TABLE scenarios ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP" if not is_postgres else "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                "ALTER TABLE scenarios ADD COLUMN mode VARCHAR DEFAULT 'manual'" if not is_postgres else "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS mode VARCHAR DEFAULT 'manual'",
                "ALTER TABLE scenarios ADD COLUMN ai_prompt VARCHAR" if not is_postgres else "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS ai_prompt VARCHAR",
                "ALTER TABLE scenarios ADD COLUMN ai_provider VARCHAR" if not is_postgres else "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS ai_provider VARCHAR",
                "ALTER TABLE scenarios ADD COLUMN ai_model VARCHAR" if not is_postgres else "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS ai_model VARCHAR",
                "ALTER TABLE scenarios ADD COLUMN system_instruction VARCHAR" if not is_postgres else "ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS system_instruction VARCHAR",
                "ALTER TABLE scenario_steps ADD COLUMN is_ai_dynamic BOOLEAN DEFAULT FALSE" if not is_postgres else "ALTER TABLE scenario_steps ADD COLUMN IF NOT EXISTS is_ai_dynamic BOOLEAN DEFAULT FALSE",
                "ALTER TABLE scenario_steps ADD COLUMN ai_prompt VARCHAR" if not is_postgres else "ALTER TABLE scenario_steps ADD COLUMN IF NOT EXISTS ai_prompt VARCHAR",
                "ALTER TABLE accounts ADD COLUMN status VARCHAR DEFAULT 'active'" if not is_postgres else "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active'",
                "ALTER TABLE accounts ADD COLUMN source_type VARCHAR DEFAULT 'tdata'" if not is_postgres else "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS source_type VARCHAR DEFAULT 'tdata'",
                "ALTER TABLE accounts ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP" if not is_postgres else "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                "ALTER TABLE inbox_messages ADD COLUMN message_id BIGINT" if not is_postgres else "ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS message_id BIGINT",
                "ALTER TABLE monitored_channels ADD COLUMN execution_mode VARCHAR DEFAULT 'scenario'" if not is_postgres else "ALTER TABLE monitored_channels ADD COLUMN IF NOT EXISTS execution_mode VARCHAR DEFAULT 'scenario'",
                "ALTER TABLE monitored_channels ADD COLUMN sender_account_id INTEGER" if not is_postgres else "ALTER TABLE monitored_channels ADD COLUMN IF NOT EXISTS sender_account_id INTEGER",
                "ALTER TABLE monitored_channels ADD COLUMN send_as_mode VARCHAR DEFAULT 'account'" if not is_postgres else "ALTER TABLE monitored_channels ADD COLUMN IF NOT EXISTS send_as_mode VARCHAR DEFAULT 'account'",
                "ALTER TABLE monitored_channels ADD COLUMN send_as_channel_username VARCHAR" if not is_postgres else "ALTER TABLE monitored_channels ADD COLUMN IF NOT EXISTS send_as_channel_username VARCHAR",
                "ALTER TABLE monitored_channels ADD COLUMN custom_prompt TEXT" if not is_postgres else "ALTER TABLE monitored_channels ADD COLUMN IF NOT EXISTS custom_prompt TEXT",
                "ALTER TABLE monitored_channels ADD COLUMN ai_model VARCHAR" if not is_postgres else "ALTER TABLE monitored_channels ADD COLUMN IF NOT EXISTS ai_model VARCHAR",
                "ALTER TABLE monitored_channels ADD COLUMN skip_ads BOOLEAN DEFAULT TRUE" if not is_postgres else "ALTER TABLE monitored_channels ADD COLUMN IF NOT EXISTS skip_ads BOOLEAN DEFAULT TRUE",
                "UPDATE prompt_templates SET title = 'Скепсис и рекомендация проверенного решения', prompt_text = 'Диалог в ветке комментариев про выбор проверенного решения. Первый сомневается и жалуется на риски. Второй советует надежный вариант без лишней воды. Третий подтверждает личным положительным опытом.' WHERE title LIKE '%ivanchik%' OR prompt_text LIKE '%ivanchik%'",
            ]
            for stmt in common_migrations:
                try:
                    await conn.execute(text(stmt))
                except Exception as m_ex:
                    logger.debug(f"Migration note for '{stmt}': {m_ex}")

            if is_postgres:
                pg_migrations = [
                    "ALTER TABLE inbox_messages ALTER COLUMN peer_id TYPE BIGINT",
                    "ALTER TABLE inbox_messages ALTER COLUMN message_id DROP NOT NULL",
                    "ALTER TABLE monitored_channels ALTER COLUMN no_repeat_scenarios TYPE BOOLEAN USING (CASE WHEN no_repeat_scenarios::text IN ('1', 'true', 't', 'TRUE') THEN TRUE ELSE FALSE END)",
                ]
                for stmt in pg_migrations:
                    try:
                        await conn.execute(text(stmt))
                    except Exception as m_ex:
                        logger.debug(f"PostgreSQL migration note for '{stmt}': {m_ex}")
    except Exception as ex:
        logger.warning(f"Database schema init note: {ex}")
