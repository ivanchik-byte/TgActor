import pytest
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base
from app.models.models import ActionLog, Account
from app.services.log_service import log_action, seed_demo_action_logs, get_action_log_stats

@pytest.mark.asyncio
async def test_action_log_creation_and_stats():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        await seed_demo_action_logs(session)

        log = await log_action(
            session=session,
            action_type="comment_send",
            status="ok",
            target="@test_channel",
            target_id="post #100",
            details={"text": "Hello world!"}
        )

        assert log.id is not None
        assert log.action_type == "comment_send"
        assert log.status == "ok"
        assert log.target == "@test_channel"

        stats = await get_action_log_stats(session)
        assert stats["total"] > 0
        assert stats["ok_count"] > 0
        assert stats["success_rate"] > 0.0

    await engine.dispose()
