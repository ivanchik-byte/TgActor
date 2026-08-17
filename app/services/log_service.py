import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_

from app.models.models import ActionLog, Account

logger = logging.getLogger("tgactor.actions")

def classify_telegram_error(ex: Any) -> Dict[str, str]:
    """
    Classifies error into high-priority human readable diagnostics:
    - 'account_banned': Аккаунт заблокирован или исключен из канала (ChannelForbidden / UserBanned)
    - 'session_expired': Сессия аккаунта слетела / заблокирован
    - 'no_accounts': Нет активных аккаунтов в пуле
    - 'chat_closed': Чат закрыт / комментарии отключены
    - 'flood_wait': Лимит Telegram (FloodWait)
    - 'peer_flood': Спам-блок или ограничение (PeerFlood)
    - 'slowmode': Медленный режим чата (Slowmode)
    - 'no_posts': В канале нет постов для комментариев
    - 'realtime_drift': Реальное время слетело / таймаут триггера
    - 'error': Общая ошибка
    """
    err_str = str(ex).lower()

    if any(k in err_str for k in ["все боты забанены", "все боты в чате забанены", "all_bots_banned", "all bots banned"]):
        return {
            "category": "all_bots_banned",
            "badge": "Все боты забанены",
            "summary": "Все доступные аккаунты из пула заблокированы или исключены из этого чата/канала"
        }

    if any(k in err_str for k in ["не хватает незабаненных", "недостаточно незабаненных", "not_enough_unbanned_bots"]):
        return {
            "category": "not_enough_unbanned_bots",
            "badge": "Не хватает ботов",
            "summary": "Недостаточно незабаненных аккаунтов в пуле для выполнения всех ролей сценария"
        }

    if any(k in err_str for k in ["usernameinvalid", "username_not_occupied", "username_invalid", "peeridinvalid", "peer_id_invalid", "chatinvalid", "chat_invalid", "invitehashinvalid", "чат не найден", "канал не найден", "chat not found"]):
        return {
            "category": "chat_not_found",
            "badge": "Чат не найден",
            "summary": "Канал или группа не найдены в Telegram (неверный юзернейм или чат удален)"
        }

    if any(k in err_str for k in ["channelforbidden", "channel_forbidden", "userbannedinchannel", "user_banned_in_channel", "userdeactivatedban", "user_deactivated_ban"]):
        return {
            "category": "account_banned",
            "badge": "Бан/Блок в канале",
            "summary": "Аккаунт заблокирован Telegram или исключен/забанен в этом канале (ChannelForbidden)"
        }

    if any(k in err_str for k in ["sessionrevoked", "authkeyunregistered", "userdeactivated", "session_revoked", "auth_key_unregistered", "user_deactivated", "unauthorized", "session_password_needed"]):
        return {
            "category": "session_expired",
            "badge": "Сессия слетела",
            "summary": "Сессия аккаунта недействительна или аккаунт был сброшен/заблокирован"
        }

    if any(k in err_str for k in ["not_enough_accounts_in_pool", "нет активных аккаунтов", "нет аккаунтов", "no_accounts"]):
        return {
            "category": "no_accounts",
            "badge": "Нет аккаунтов",
            "summary": "В базе данных нет активных аккаунтов в пуле для выполнения задачи"
        }

    if any(k in err_str for k in ["chatwriteforbidden", "chat_write_forbidden", "chatadminrequired", "channelprivate", "msg_id_invalid", "msgidinvalid", "отключены комментарии", "нет группы"]):
        return {
            "category": "chat_closed",
            "badge": "Чат закрыт",
            "summary": "У канала отключены комментарии или закрыта группа для обсуждений"
        }

    if any(k in err_str for k in ["floodwait", "flood_wait", "420", "flood"]):
        sec_match = re.search(r'(\d+)\s*(?:seconds|s|сек)', err_str)
        sec_text = f" на {sec_match.group(1)} сек" if sec_match else ""
        return {
            "category": "flood_wait",
            "badge": "FloodWait лимит",
            "summary": f"Временное ограничение Telegram по частоте (FloodWait{sec_text})"
        }

    if any(k in err_str for k in ["peerflood", "peer_flood", "userrestricted", "user_restricted", "spambot"]):
        return {
            "category": "peer_flood",
            "badge": "Спам-блок аккаунта",
            "summary": "Telegram временно ограничил отправку с этого аккаунта (PeerFlood / Спам-блок)"
        }

    if any(k in err_str for k in ["slowmode", "slow_mode", "slowmodewait"]):
        return {
            "category": "slowmode",
            "badge": "Slowmode ожидание",
            "summary": "В группе включен медленный режим (Slowmode), нужно выждать паузу"
        }

    if any(k in err_str for k in ["нет опубликованных постов", "no posts", "no message"]):
        return {
            "category": "no_posts",
            "badge": "Нет постов",
            "summary": "В канале нет опубликованных постов для комментирования"
        }

    if any(k in err_str for k in ["timeout", "timed out", "connect", "proxy", "connection", "drift", "слетело"]):
        return {
            "category": "realtime_drift",
            "badge": "Реальное время слетело",
            "summary": "Слетело реальное время синхронизации или возник таймаут соединения через прокси"
        }

    return {
        "category": "error",
        "badge": "Ошибка",
        "summary": str(ex)
    }

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
    """Record detailed real backend action in bot_action_log table and print to terminal log."""
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

    # Print clean formatted event to terminal
    acc_label = f"Account #{valid_acc_id}" if valid_acc_id else "System"
    tgt_label = f" -> {target}" if target else ""
    t_id_label = f" [{target_id}]" if target_id else ""
    summary_label = f" | {details_str}" if details_str and len(details_str) < 120 else ""

    log_line = f"{action_type.upper()}: {acc_label}{tgt_label}{t_id_label}{summary_label}"

    if status == "error":
        logger.error(log_line)
    elif status in ["warning", "cooldown"]:
        logger.warning(log_line)
    else:
        logger.info(log_line)

    if commit:
        try:
            await session.commit()
        except Exception as ex:
            await session.rollback()
            logger.warning(f"log_action commit note: {ex}")
    return log_entry

async def get_action_log_stats(session: AsyncSession) -> Dict[str, Any]:
    """Calculate KPI metrics for action logs."""
    total_stmt = select(func.count(ActionLog.id))
    total = (await session.execute(total_stmt)).scalar() or 0

    ok_stmt = select(func.count(ActionLog.id)).where(ActionLog.status == 'ok')
    ok_count = (await session.execute(ok_stmt)).scalar() or 0

    err_stmt = select(func.count(ActionLog.id)).where(ActionLog.status == 'error')
    error_count = (await session.execute(err_stmt)).scalar() or 0

    warn_stmt = select(func.count(ActionLog.id)).where(ActionLog.status.in_(['warning', 'cooldown']))
    warning_count = (await session.execute(warn_stmt)).scalar() or 0

    unique_acc_stmt = select(func.count(func.distinct(ActionLog.account_id))).where(ActionLog.account_id.isnot(None))
    active_accounts = (await session.execute(unique_acc_stmt)).scalar() or 0

    since_24h = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    h24_stmt = select(func.count(ActionLog.id)).where(ActionLog.executed_at >= since_24h)
    count_24h = (await session.execute(h24_stmt)).scalar() or 0

    success_rate = round((ok_count / total * 100), 1) if total > 0 else 100.0

    return {
        "total": total,
        "ok_count": ok_count,
        "error_count": error_count,
        "warning_count": warning_count,
        "active_accounts": active_accounts,
        "count_24h": count_24h,
        "success_rate": success_rate
    }

async def seed_demo_action_logs(session: AsyncSession):
    """No-op: Demo seeding removed. Only real backend actions are logged."""
    pass
