from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.core.database import async_session
from app.models.models import TaskLog
from app.workers.channel_monitor import is_monitor_running, start_channel_monitor, stop_channel_monitor

router = APIRouter()

@router.get("/api/monitor/status")
async def get_monitor_status():
    return {"running": is_monitor_running()}

@router.post("/api/monitor/toggle")
async def toggle_monitor():
    if is_monitor_running():
        await stop_channel_monitor()
    else:
        await start_channel_monitor()
    return {"running": is_monitor_running()}

@router.get("/api/logs")
async def get_task_logs(limit: int = 100, status: Optional[str] = None, search: Optional[str] = None):
    async with async_session() as session:
        stmt = select(TaskLog).order_by(TaskLog.executed_at.desc())
        if status and status != "all":
            stmt = stmt.where(TaskLog.status == status)
        if search:
            stmt = stmt.where(TaskLog.error_message.ilike(f"%{search}%"))
        stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        return result.scalars().all()
