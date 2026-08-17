import asyncio
import random
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy import select

from app.core.database import async_session
from app.telegram.client import get_hydrogram_client
from app.models.models import Account
from app.services.log_service import log_action, classify_telegram_error

logger = logging.getLogger(__name__)

# In-memory progress state for fleet joining
_current_join_task: Optional[asyncio.Task] = None
_known_chat_members: Dict[str, set] = {}
_banned_chat_members: Dict[str, set] = {}

_join_state: Dict[str, Any] = {
    "status": "idle", # "idle" | "running" | "paused" | "done" | "cancelled" | "error"
    "chat_link": "",
    "total_accounts": 0,
    "joined_count": 0,
    "failed_count": 0,
    "current_account": None,
    "next_delay_seconds": 0,
    "progress_percent": 0,
    "logs": []
}

def record_chat_member(chat_target: str, account_id: int):
    global _known_chat_members, _banned_chat_members
    key = str(chat_target).strip().lower().replace('@', '').split('/')[-1]
    if key not in _known_chat_members:
        _known_chat_members[key] = set()
    _known_chat_members[key].add(account_id)
    if key in _banned_chat_members:
        _banned_chat_members[key].discard(account_id)

def record_banned_chat_member(chat_target: str, account_id: int):
    global _banned_chat_members, _known_chat_members
    key = str(chat_target).strip().lower().replace('@', '').split('/')[-1]
    if key not in _banned_chat_members:
        _banned_chat_members[key] = set()
    _banned_chat_members[key].add(account_id)
    if key in _known_chat_members:
        _known_chat_members[key].discard(account_id)

def get_known_chat_members(chat_target: str) -> set:
    key = str(chat_target).strip().lower().replace('@', '').split('/')[-1]
    return _known_chat_members.get(key, set())

def get_banned_chat_members(chat_target: str) -> set:
    key = str(chat_target).strip().lower().replace('@', '').split('/')[-1]
    return _banned_chat_members.get(key, set())

def is_banned_in_chat(chat_target: str, account_id: int) -> bool:
    key = str(chat_target).strip().lower().replace('@', '').split('/')[-1]
    return account_id in _banned_chat_members.get(key, set())

def get_join_status() -> Dict[str, Any]:
    return _join_state

async def cancel_smooth_join() -> bool:
    global _current_join_task
    if _current_join_task and not _current_join_task.done():
        _current_join_task.cancel()
        _join_state["status"] = "cancelled"
        _join_state["logs"].insert(0, "🛑 Процесс плавного входа отменён пользователем.")
        return True
    return False

async def _smooth_join_worker(
    chat_links: List[str],
    account_ids: List[int],
    min_delay: int,
    max_delay: int
):
    global _join_state
    _join_state["status"] = "running"
    _join_state["total_accounts"] = len(account_ids) * len(chat_links)
    _join_state["joined_count"] = 0
    _join_state["failed_count"] = 0
    _join_state["progress_percent"] = 0
    _join_state["logs"] = []

    total_ops = len(account_ids) * len(chat_links)
    current_op = 0

    async with async_session() as session:
        try:
            # Fetch accounts with proxies
            stmt = select(Account).where(Account.id.in_(account_ids))
            res = await session.execute(stmt)
            accounts_map = {acc.id: acc for acc in res.scalars().all()}

            for chat_link in chat_links:
                clean_target = chat_link.strip()
                if not clean_target:
                    continue

                for acc_id in account_ids:
                    if _join_state["status"] == "cancelled":
                        break

                    acc = accounts_map.get(acc_id)
                    if not acc:
                        continue

                    client = get_hydrogram_client(acc, acc.proxy)
                    try:
                        await client.start()
                        try:
                            me = await client.get_me()
                            live_label = acc.custom_name or (f"@{me.username}" if getattr(me, 'username', None) else (me.first_name or f"Бот #{acc.id}"))
                            live_phone = getattr(me, 'phone_number', None) or acc.phone or ''
                            _join_state["current_account"] = f"{live_label} ({live_phone})"
                            acc_label = live_label
                        except Exception:
                            pass
                        
                        # 1. Join main chat / channel / invite link
                        target_to_join = clean_target
                        if "t.me/+" in target_to_join or "joinchat/" in target_to_join:
                            pass # keep full invite link
                        elif "t.me/" in target_to_join:
                            target_to_join = target_to_join.split("t.me/")[-1].replace("@", "").strip().split("/")[0]

                        was_already_member = False
                        try:
                            joined_chat = await client.join_chat(target_to_join)
                        except Exception as join_err:
                            err_str = str(join_err).lower()
                            if any(k in err_str for k in ["useralreadyparticipant", "already participant", "already a participant"]):
                                was_already_member = True
                                joined_chat = await client.get_chat(target_to_join)
                            else:
                                raise join_err

                        record_chat_member(str(target_to_join), acc.id)
                        if joined_chat and getattr(joined_chat, 'id', None):
                            record_chat_member(str(joined_chat.id), acc.id)

                        # 2. If target is a broadcast channel, also join its linked discussion group
                        if joined_chat and getattr(joined_chat, 'type', None) and (
                            str(joined_chat.type).lower().endswith('channel') or getattr(joined_chat.type, 'value', '') == 'channel'
                        ):
                            linked = getattr(joined_chat, 'linked_chat', None)
                            if not linked:
                                try:
                                    full_c = await client.get_chat(joined_chat.id)
                                    linked = getattr(full_c, 'linked_chat', None)
                                except Exception:
                                    pass
                            
                            if linked and getattr(linked, 'id', None):
                                try:
                                    await client.join_chat(linked.id)
                                    record_chat_member(str(linked.id), acc.id)
                                except Exception as link_err:
                                    if not any(k in str(link_err).lower() for k in ["useralreadyparticipant", "already participant"]):
                                        logger.warning(f"Could not join linked discussion {linked.id}: {link_err}")

                        _join_state["joined_count"] += 1
                        if was_already_member:
                            _join_state["logs"].insert(0, f"✅ {acc_label} уже состоит в {clean_target}")
                        else:
                            _join_state["logs"].insert(0, f"✅ {acc_label} успешно вступил в {clean_target}")
                        
                        await log_action(
                            session,
                            action_type="fleet_join",
                            status="ok",
                            account_id=acc.id,
                            target=clean_target,
                            target_id=f"join • {acc_label}",
                            details={"chat": clean_target, "account": acc_label, "already_member": was_already_member}
                        )
                        await session.commit()
                    except Exception as e:
                        diag = classify_telegram_error(e)
                        _join_state["failed_count"] += 1
                        _join_state["logs"].insert(0, f"❌ {acc_label} не смог вступить в {clean_target} ({diag['badge']}): {str(e)[:100]}")
                        
                        await log_action(
                            session,
                            action_type="fleet_join",
                            status="error",
                            account_id=acc.id,
                            target=clean_target,
                            target_id=f"{diag['badge']} • {acc_label}",
                            details={"chat": clean_target, "error": str(e), "badge": diag["badge"]}
                        )
                        await session.commit()
                    finally:
                        try:
                            await client.stop()
                        except Exception:
                            pass

                    current_op += 1
                    _join_state["progress_percent"] = int((current_op / total_ops) * 100)

                    # Pause between account joins ONLY if a bot freshly joined (no pause needed if already a participant)
                    if current_op < total_ops and _join_state["status"] == "running":
                        if was_already_member:
                            # Instant transition for existing members
                            await asyncio.sleep(0.5)
                        else:
                            delay = random.randint(max(1, min_delay), max(min_delay, max_delay))
                            _join_state["next_delay_seconds"] = delay
                            _join_state["logs"].insert(0, f"⏳ Пауза {delay} сек перед входом следующего бота...")
                            
                            for _ in range(delay):
                                if _join_state["status"] == "cancelled":
                                    break
                                await asyncio.sleep(1)
                                _join_state["next_delay_seconds"] = max(0, _join_state["next_delay_seconds"] - 1)

            if _join_state["status"] != "cancelled":
                _join_state["status"] = "done"
                _join_state["logs"].insert(0, f"🎉 Плавный вход завершен: {_join_state['joined_count']} успешно, {_join_state['failed_count']} ошибок.")
        except asyncio.CancelledError:
            _join_state["status"] = "cancelled"
        except Exception as ex:
            logger.error(f"Smooth join worker error: {ex}")
            _join_state["status"] = "error"
            _join_state["logs"].insert(0, f"⚠️ Критическая ошибка: {ex}")

async def start_smooth_join(
    chat_links: List[str],
    account_ids: List[int],
    min_delay: int = 30,
    max_delay: int = 90
) -> Dict[str, Any]:
    global _current_join_task, _join_state
    
    if _current_join_task and not _current_join_task.done():
        return {"status": "error", "message": "Процесс входа уже запущен."}

    _join_state["chat_link"] = ", ".join(chat_links)
    _current_join_task = asyncio.create_task(
        _smooth_join_worker(chat_links, account_ids, min_delay, max_delay)
    )
    return {"status": "started", "total_accounts": len(account_ids) * len(chat_links)}
