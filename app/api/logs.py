import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Response, Query
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import selectinload

from app.core.database import async_session
from app.models.models import TaskLog, ActionLog, Account
from app.services.log_service import seed_demo_action_logs, get_action_log_stats
from app.workers.channel_monitor import is_monitor_running, start_channel_monitor, stop_channel_monitor

router = APIRouter()

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

@router.get("/api/logs/actions")
async def get_action_logs(
    account_id: Optional[int] = Query(None),
    action_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    period: Optional[str] = Query(None), # 'today', '24h', '7d', '30d'
    search: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    async with async_session() as session:
        stmt = select(ActionLog).options(selectinload(ActionLog.account)).order_by(ActionLog.executed_at.desc())

        if account_id is not None:
            stmt = stmt.where(ActionLog.account_id == account_id)
        if action_type and action_type != "all":
            if action_type == "bot_actions" or action_type == "exclude_monitor":
                stmt = stmt.where(ActionLog.action_type != "channel_monitor")
            else:
                stmt = stmt.where(ActionLog.action_type == action_type)
        if status and status != "all":
            stmt = stmt.where(ActionLog.status == status)

        if period:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            if period == 'today':
                today_start = datetime(now.year, now.month, now.day)
                stmt = stmt.where(ActionLog.executed_at >= today_start)
            elif period == '24h':
                stmt = stmt.where(ActionLog.executed_at >= now - timedelta(hours=24))
            elif period == '7d':
                stmt = stmt.where(ActionLog.executed_at >= now - timedelta(days=7))
            elif period == '30d':
                stmt = stmt.where(ActionLog.executed_at >= now - timedelta(days=30))

        if search:
            term = f"%{search}%"
            stmt = stmt.outerjoin(Account).where(
                or_(
                    ActionLog.target.ilike(term),
                    ActionLog.target_id.ilike(term),
                    ActionLog.details.ilike(term),
                    ActionLog.action_type.ilike(term),
                    Account.phone.ilike(term),
                    Account.username.ilike(term),
                    Account.first_name.ilike(term)
                )
            )

        stmt = stmt.offset(offset).limit(limit)
        res = await session.execute(stmt)
        logs = res.scalars().all()

        items = []
        for l in logs:
            items.append({
                "id": l.id,
                "executed_at": l.executed_at.isoformat() if l.executed_at else None,
                "account_id": l.account_id,
                "account_phone": l.account.phone if l.account else None,
                "account_name": f"{l.account.first_name or ''} {l.account.last_name or ''}".strip() if l.account else None,
                "account_username": l.account.username if l.account else None,
                "scenario_id": l.scenario_id,
                "action_type": l.action_type,
                "status": l.status,
                "target": l.target,
                "target_id": l.target_id,
                "details": l.details,
            })

        return items

@router.get("/api/logs/stats")
async def get_logs_stats():
    async with async_session() as session:
        stats = await get_action_log_stats(session)
        return stats

@router.get("/api/logs/filters")
async def get_log_filters():
    async with async_session() as session:
        # Get unique action types
        action_stmt = select(func.distinct(ActionLog.action_type))
        action_types = [a for a in (await session.execute(action_stmt)).scalars().all() if a]

        # Get unique statuses
        status_stmt = select(func.distinct(ActionLog.status))
        statuses = [s for s in (await session.execute(status_stmt)).scalars().all() if s]

        # Get accounts that have logs
        acc_stmt = select(Account).order_by(Account.id)
        accounts = (await session.execute(acc_stmt)).scalars().all()
        account_options = [
            {
                "id": a.id,
                "label": f"#{a.id} {a.first_name or ''} ({a.phone or a.username or ''})".strip()
            }
            for a in accounts
        ]

        return {
            "action_types": sorted(action_types),
            "statuses": sorted(statuses),
            "accounts": account_options
        }

@router.post("/api/logs/clear")
async def clear_action_logs(mode: str = Query("all")): # 'all', '7days', '30days'
    async with async_session() as session:
        if mode == "all":
            await session.execute(delete(ActionLog))
        elif mode == "7days":
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)
            await session.execute(delete(ActionLog).where(ActionLog.executed_at < cutoff))
        elif mode == "30days":
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
            await session.execute(delete(ActionLog).where(ActionLog.executed_at < cutoff))
        await session.commit()
        return {"status": "ok", "cleared": mode}

@router.get("/api/logs/export")
async def export_action_logs(
    account_id: Optional[int] = Query(None),
    action_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    async with async_session() as session:
        stmt = select(ActionLog).options(selectinload(ActionLog.account)).order_by(ActionLog.executed_at.desc()).limit(1000)
        if account_id is not None:
            stmt = stmt.where(ActionLog.account_id == account_id)
        if action_type and action_type != "all":
            stmt = stmt.where(ActionLog.action_type == action_type)
        if status and status != "all":
            stmt = stmt.where(ActionLog.status == status)

        res = await session.execute(stmt)
        logs = res.scalars().all()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Date Time (UTC)", "Account ID", "Phone", "Action Type", "Status", "Target", "Target ID", "Details"])

        for l in logs:
            writer.writerow([
                l.id,
                l.executed_at.strftime("%Y-%m-%d %H:%M:%S") if l.executed_at else "",
                l.account_id or "",
                l.account.phone if l.account else "",
                l.action_type,
                l.status,
                l.target or "",
                l.target_id or "",
                l.details or ""
            ])

        output.seek(0)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=bot_action_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
