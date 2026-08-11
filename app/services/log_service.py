import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_

from app.models.models import ActionLog, Account

logger = logging.getLogger(__name__)

async def log_action(
    session: AsyncSession,
    action_type: str,
    status: str,
    account_id: Optional[int] = None,
    target: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[Any] = None,
    scenario_id: Optional[int] = None,
    executed_at: Optional[datetime] = None,
    commit: bool = True
) -> ActionLog:
    """Record detailed real backend action in bot_action_log table."""
    if isinstance(details, (dict, list)):
        details_str = json.dumps(details, ensure_ascii=False)
    else:
        details_str = str(details) if details is not None else None

    # Validate account existence if account_id provided to avoid foreign key violation
    valid_acc_id = account_id
    if account_id is not None:
        try:
            acc_check = await session.get(Account, account_id)
            if not acc_check:
                valid_acc_id = None
        except Exception:
            valid_acc_id = None

    log_entry = ActionLog(
        account_id=valid_acc_id,
        scenario_id=scenario_id,
        action_type=action_type,
        status=status,
        target=target,
        target_id=target_id,
        details=details_str,
        executed_at=executed_at or datetime.now(timezone.utc).replace(tzinfo=None)
    )
    session.add(log_entry)
    if commit:
        try:
            await session.commit()
        except Exception as ex:
            await session.rollback()
            logger.warning(f"log_action commit note: {ex}")
    return log_entry

async def seed_demo_action_logs(session: AsyncSession):
    """No-op: Demo seeding removed. Only real backend actions are logged."""
    pass

async def get_action_log_stats(session: AsyncSession) -> Dict[str, Any]:
    """Calculate summary metrics for action logs UI header."""
    total_stmt = select(func.count(ActionLog.id))
    total = (await session.execute(total_stmt)).scalar() or 0

    ok_stmt = select(func.count(ActionLog.id)).where(ActionLog.status == 'ok')
    ok_count = (await session.execute(ok_stmt)).scalar() or 0

    err_stmt = select(func.count(ActionLog.id)).where(ActionLog.status == 'error')
    err_count = (await session.execute(err_stmt)).scalar() or 0

    warn_stmt = select(func.count(ActionLog.id)).where(ActionLog.status.in_(['warning', 'cooldown']))
    warn_count = (await session.execute(warn_stmt)).scalar() or 0

    unique_acc_stmt = select(func.count(func.distinct(ActionLog.account_id))).where(ActionLog.account_id.isnot(None))
    active_accounts = (await session.execute(unique_acc_stmt)).scalar() or 0

    since_24h = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    h24_stmt = select(func.count(ActionLog.id)).where(ActionLog.executed_at >= since_24h)
    count_24h = (await session.execute(h24_stmt)).scalar() or 0

    success_rate = round((ok_count / total * 100), 1) if total > 0 else 100.0

    return {
        "total": total,
        "ok_count": ok_count,
        "error_count": err_count,
        "warning_count": warn_count,
        "active_accounts": active_accounts,
        "count_24h": count_24h,
        "success_rate": success_rate
    }
