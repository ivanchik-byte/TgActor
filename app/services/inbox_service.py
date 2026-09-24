import os
import tempfile
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import UploadFile
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import async_session
from app.models.models import Account, InboxMessage, Proxy
from app.telegram.client import get_hydrogram_client

logger = logging.getLogger(__name__)

MEDIA_DIR = Path("media/inbox")
ALLOWED_MEDIA_EXTS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov",
    ".mp3", ".ogg", ".wav", ".pdf", ".zip",
}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

async def sync_dialogs_for_account(account_input: Any, max_dialogs: int = 25, max_messages: int = 50) -> int:
    acc_id = account_input.id if isinstance(account_input, Account) else account_input

    async with async_session() as session:
        stmt = select(Account).options(selectinload(Account.proxy)).where(Account.id == acc_id)
        account = (await session.execute(stmt)).scalars().first()

    if not account or not account.session_string:
        return 0

    client = get_hydrogram_client(account, account.proxy)
    new_messages_count = 0

    try:
        await client.start()
        
        async with async_session() as session:
            async for dialog in client.get_dialogs(limit=max_dialogs):
                chat = dialog.chat
                if not chat:
                    continue

                chat_type_str = str(getattr(chat, 'type', '')).lower()
                if "channel" in chat_type_str and "supergroup" not in chat_type_str:
                    continue

                peer_username = chat.username or None
                u_name = (peer_username or "").lower()
                if u_name in ["telegram", "wallet"] or chat.id in [777000, 42777]:
                    continue

                peer_id = chat.id
                
                if chat.first_name:
                    peer_name = f"{chat.first_name} {chat.last_name}".strip() if chat.last_name else chat.first_name
                elif chat.title:
                    peer_name = chat.title
                else:
                    peer_name = f"ID {peer_id}"

                history = []
                async for msg in client.get_chat_history(chat_id=peer_id, limit=max_messages):
                    history.append(msg)
                if not history:
                    continue
                known_ids = set()
                tg_ids = [getattr(m, 'id', None) for m in history if getattr(m, 'id', None)]
                if tg_ids:
                    rows = await session.execute(
                        select(InboxMessage.message_id).where(
                            InboxMessage.account_id == account.id,
                            InboxMessage.peer_id == peer_id,
                            InboxMessage.message_id.in_(tg_ids)
                        )
                    )
                    known_ids = set(rows.scalars().all())
                for msg in history:
                    msg_text = msg.text or msg.caption or ("📷 Фото/Медиа" if msg.media else "")
                    if not msg_text and not msg.media:
                        continue
                    
                    is_incoming = not msg.outgoing
                    raw_date = msg.date if msg.date else datetime.now(timezone.utc)
                    msg_date = raw_date.replace(tzinfo=None) if hasattr(raw_date, 'tzinfo') and raw_date.tzinfo else raw_date

                    tg_msg_id = getattr(msg, 'id', None)
                    if tg_msg_id and tg_msg_id in known_ids:
                        continue
                    if tg_msg_id:
                        existing = None
                    else:
                        stmt = select(InboxMessage).where(
                            InboxMessage.account_id == account.id,
                            InboxMessage.peer_id == peer_id,
                            InboxMessage.text == msg_text,
                            InboxMessage.incoming == is_incoming
                        )
                        existing = (await session.execute(stmt)).scalars().first()
                    if tg_msg_id or not existing:
                        inbox_msg = InboxMessage(
                            account_id=account.id,
                            message_id=tg_msg_id,
                            peer_id=peer_id,
                            peer_name=peer_name,
                            peer_username=peer_username,
                            incoming=is_incoming,
                            text=msg_text,
                            media_path=None,
                            created_at=msg_date
                        )
                        session.add(inbox_msg)
                        new_messages_count += 1
                
            await session.commit()
            if new_messages_count > 0:
                logger.info(f"Successfully synced dialogs for Account #{account.id} ({account.phone}): {new_messages_count} new messages")

    except Exception as e:
        logger.error(f"Error syncing dialogs for Account #{acc_id}: {e}")
    finally:
        try:
            await client.stop()
        except Exception:
            pass

    return new_messages_count

async def sync_all_accounts_dialogs() -> Dict[str, Any]:
    async with async_session() as session:
        stmt = select(Account).where(
            Account.is_active == True,
            Account.session_string.isnot(None)
        ).options(selectinload(Account.proxy))
        accounts = (await session.execute(stmt)).scalars().all()
        account_ids = [acc.id for acc in accounts]

    total_new = 0
    synced_accounts = 0

    for acc_id in account_ids:
        try:
            count = await sync_dialogs_for_account(acc_id)
            total_new += count
            synced_accounts += 1
        except Exception as e:
            logger.error(f"Failed to sync dialogs for account {acc_id}: {e}")

    return {
        "status": "ok",
        "synced_accounts": synced_accounts,
        "total_messages": total_new
    }

async def clear_inbox_sync(account_id: Optional[int] = None) -> Dict[str, Any]:
    async with async_session() as session:
        if account_id is not None:
            stmt = delete(InboxMessage).where(InboxMessage.account_id == account_id)
        else:
            stmt = delete(InboxMessage)
        
        result = await session.execute(stmt)
        await session.commit()
        
        try:
            from app.core.events import publish_inbox_event as broadcast_inbox_event
            await broadcast_inbox_event({"event": "sync_cleared", "account_id": account_id})
        except Exception:
            pass

        return {"status": "ok", "deleted_rows": result.rowcount}

async def send_inbox_message(
    account_id: int,
    peer_id: int,
    text: str,
    file: Optional[UploadFile] = None,
    reply_to_msg_id: Optional[int] = None
) -> Dict[str, Any]:
    """Send an outgoing direct message or attachment via Telegram and save to DB."""
    async with async_session() as session:
        stmt = select(Account).options(selectinload(Account.proxy)).where(Account.id == account_id)
        account = (await session.execute(stmt)).scalars().first()
        if not account or not account.session_string:
            raise ValueError(f"Account #{account_id} not found or not active")

    client = get_hydrogram_client(account, account.proxy)
    try:
        await client.start()
        sent_media_path = None

        if file:
            MEDIA_DIR.mkdir(parents=True, exist_ok=True)
            ext = Path(file.filename or "").suffix.lower()
            if ext not in ALLOWED_MEDIA_EXTS:
                raise ValueError("unsupported attachment type")
            safe_filename = f"out_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex}{ext}"
            save_path = (MEDIA_DIR / safe_filename).resolve()
            if save_path.parent != MEDIA_DIR.resolve():
                raise ValueError("bad attachment name")
            seen = 0
            with open(save_path, "wb") as out:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    seen += len(chunk)
                    if seen > MAX_UPLOAD_BYTES:
                        out.close()
                        os.remove(save_path)
                        raise ValueError("attachment too large")
                    out.write(chunk)

            is_photo = file.content_type and "image" in file.content_type
            if is_photo:
                sent_msg = await client.send_photo(
                    chat_id=peer_id,
                    photo=str(save_path),
                    caption=text,
                    reply_to_message_id=reply_to_msg_id
                )
            else:
                sent_msg = await client.send_document(
                    chat_id=peer_id,
                    document=str(save_path),
                    caption=text,
                    reply_to_message_id=reply_to_msg_id
                )
            sent_media_path = f"/media/inbox/{safe_filename}"
        else:
            sent_msg = await client.send_message(
                chat_id=peer_id, 
                text=text,
                reply_to_message_id=reply_to_msg_id
            )

        peer_name = f"ID {peer_id}"
        peer_username = None
        try:
            chat = await client.get_chat(peer_id)
            if chat.first_name:
                peer_name = f"{chat.first_name} {chat.last_name}".strip() if chat.last_name else chat.first_name
            elif chat.title:
                peer_name = chat.title
            peer_username = chat.username
        except Exception:
            pass

        async with async_session() as session:
            msg_obj = InboxMessage(
                account_id=account.id,
                message_id=getattr(sent_msg, 'id', None),
                peer_id=peer_id,
                peer_name=peer_name,
                peer_username=peer_username,
                incoming=False,
                text=text or (sent_msg.caption if hasattr(sent_msg, 'caption') else ""),
                media_path=sent_media_path,
                created_at=datetime.now(timezone.utc)
            )
            session.add(msg_obj)
            await session.commit()
            await session.refresh(msg_obj)

        try:
            from app.core.events import publish_inbox_event as broadcast_inbox_event
            await broadcast_inbox_event({
                "event": "message_sent",
                "account_id": account_id,
                "peer_id": peer_id,
                "message_id": msg_obj.id
            })
        except Exception:
            pass

        return {"status": "ok", "message_id": msg_obj.id, "telegram_msg_id": getattr(sent_msg, 'id', None)}

    finally:
        try:
            await client.stop()
        except Exception:
            pass

async def edit_inbox_message(
    account_id: int,
    peer_id: int,
    message_id: int,
    new_text: str
) -> Dict[str, Any]:
    async with async_session() as session:
        result = await session.execute(
            select(Account).options(selectinload(Account.proxy)).where(Account.id == account_id)
        )
        account = result.scalars().first()
        if not account:
            raise ValueError(f"Account #{account_id} not found")

        db_msg = await session.get(InboxMessage, message_id)
        if not db_msg or db_msg.account_id != account_id:
            raise ValueError("Message not found")
        tg_msg_id = db_msg.message_id
        if not tg_msg_id:
            raise ValueError("Message has no Telegram id")
        session.expunge(account)
        if account.proxy is not None:
            try:
                session.expunge(account.proxy)
            except Exception:
                pass

    client = get_hydrogram_client(account, account.proxy)
    try:
        await client.start()
        await client.edit_message_text(chat_id=peer_id, message_id=tg_msg_id, text=new_text)

        async with async_session() as session:
            m = await session.get(InboxMessage, message_id)
            if m:
                m.text = new_text
                await session.commit()

        try:
            from app.core.events import publish_inbox_event as broadcast_inbox_event
            await broadcast_inbox_event({
                "event": "message_edited",
                "account_id": account_id,
                "peer_id": peer_id,
                "message_id": message_id,
                "new_text": new_text
            })
        except Exception:
            pass

        return {"status": "ok", "new_text": new_text}
    finally:
        try:
            await client.stop()
        except Exception:
            pass

async def delete_inbox_message(
    account_id: int,
    peer_id: int,
    message_id: int
) -> Dict[str, Any]:
    async with async_session() as session:
        result = await session.execute(
            select(Account).options(selectinload(Account.proxy)).where(Account.id == account_id)
        )
        account = result.scalars().first()
        if not account:
            raise ValueError(f"Account #{account_id} not found")

        db_msg = await session.get(InboxMessage, message_id)
        if not db_msg or db_msg.account_id != account_id:
            raise ValueError("Message not found")
        tg_msg_id = db_msg.message_id
        if not tg_msg_id:
            raise ValueError("Message has no Telegram id")
        session.expunge(account)
        if account.proxy is not None:
            try:
                session.expunge(account.proxy)
            except Exception:
                pass

    client = get_hydrogram_client(account, account.proxy)
    try:
        await client.start()
        await client.delete_messages(chat_id=peer_id, message_ids=[tg_msg_id], revoke=True)

        async with async_session() as session:
            m = await session.get(InboxMessage, message_id)
            if m:
                await session.delete(m)
                await session.commit()

        try:
            from app.core.events import publish_inbox_event as broadcast_inbox_event
            await broadcast_inbox_event({
                "event": "message_deleted",
                "account_id": account_id,
                "peer_id": peer_id,
                "message_id": message_id
            })
        except Exception:
            pass

        return {"status": "ok"}
    finally:
        try:
            await client.stop()
        except Exception:
            pass

async def download_media_for_message(message_id: int) -> Optional[str]:
    async with async_session() as session:
        msg = await session.get(InboxMessage, message_id)
        if not msg:
            raise ValueError("Сообщение не найдено")

        if msg.media_path:
            disk_file = msg.media_path.lstrip("/")
            if os.path.exists(disk_file):
                return msg.media_path

        stmt = select(Account).options(selectinload(Account.proxy)).where(Account.id == msg.account_id)
        account = (await session.execute(stmt)).scalars().first()
        if not account or not account.session_string:
            raise ValueError("Аккаунт не найден или не авторизован")

        client = get_hydrogram_client(account, account.proxy)
        try:
            await client.start()
            tg_msg_id = msg.message_id
            if not tg_msg_id:
                raise ValueError("Отсутствует ID сообщения в Telegram")

            tg_msgs = await client.get_messages(chat_id=msg.peer_id, message_ids=tg_msg_id)
            tg_msg = tg_msgs if not isinstance(tg_msgs, list) else (tg_msgs[0] if tg_msgs else None)
            if not tg_msg or not tg_msg.media:
                raise ValueError("В сообщении Telegram нет медиафайла")

            os.makedirs("media/inbox", exist_ok=True)
            saved_path = await client.download_media(tg_msg, file_name="media/inbox/")
            if saved_path:
                saved_str = str(saved_path).replace("\\", "/")
                if "/media/" in saved_str:
                    rel_path = "/media/" + saved_str.split("/media/", 1)[1]
                elif saved_str.startswith("media/"):
                    rel_path = "/" + saved_str
                else:
                    rel_path = "/" + saved_str.lstrip("/")
                msg.media_path = rel_path
                await session.commit()

                try:
                    from app.core.events import publish_inbox_event as broadcast_inbox_event
                    await broadcast_inbox_event({
                        "event": "media_downloaded",
                        "message_id": message_id,
                        "account_id": msg.account_id,
                        "peer_id": msg.peer_id,
                        "media_path": rel_path
                    })
                except Exception:
                    pass

                return rel_path
            raise ValueError("Не удалось сохранить медиафайл")
        finally:
            try:
                await client.stop()
            except Exception:
                pass
