import os
import tempfile
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload
from app.core.database import async_session
from app.models.models import Account, InboxMessage, Proxy
from app.telegram.client import get_hydrogram_client

logger = logging.getLogger(__name__)

async def sync_dialogs_for_account(account_input: Any, max_dialogs: int = 20, max_messages: int = 40) -> int:
    """
    Sync dialogs and recent messages from Telegram for a given account.
    Only imports private DMs and bot chats (skipping public channels and groups).
    Returns the number of new messages imported.
    """
    acc_id = account_input.id if isinstance(account_input, Account) else account_input

    # Eagerly fetch Account with Proxy in active session to avoid DetachedInstanceError
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
                # Filter out channels, groups, and bot chats — ONLY sync 1-on-1 private user DMs!
                chat_type_str = str(getattr(chat, 'type', '')).lower()
                if "private" not in chat_type_str or "bot" in chat_type_str or getattr(chat, 'is_bot', False):
                    continue

                peer_username = chat.username or None
                u_name = (peer_username or "").lower()
                if u_name.endswith("bot") or u_name in ["telegram", "wallet"] or chat.id in [777000, 42777]:
                    continue

                peer_id = chat.id
                
                # Format peer display name
                if chat.first_name:
                    peer_name = f"{chat.first_name} {chat.last_name}".strip() if chat.last_name else chat.first_name
                elif chat.title:
                    peer_name = chat.title
                else:
                    peer_name = f"ID {peer_id}"

                peer_username = chat.username or None

                async for msg in client.get_chat_history(chat_id=peer_id, limit=max_messages):
                    msg_text = msg.text or msg.caption or ("📷 Фото/Медиа" if msg.media else "")
                    if not msg_text and not msg.media:
                        continue
                    
                    is_incoming = not msg.outgoing
                    raw_date = msg.date if msg.date else datetime.utcnow()
                    msg_date = raw_date.replace(tzinfo=None) if hasattr(raw_date, 'tzinfo') and raw_date.tzinfo else raw_date

                    # Check if message already exists by account, peer, text, and direction
                    stmt = select(InboxMessage).where(
                        InboxMessage.account_id == account.id,
                        InboxMessage.peer_id == peer_id,
                        InboxMessage.text == msg_text,
                        InboxMessage.incoming == is_incoming
                    )
                    existing = (await session.execute(stmt)).scalars().first()
                    if not existing:
                        inbox_msg = InboxMessage(
                            account_id=account.id,
                            message_id=getattr(msg, 'id', None),
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
            logger.info(f"Successfully synced dialogs for Account #{account.id} ({account.phone}): {new_messages_count} new messages")

    except Exception as e:
        logger.error(f"Error syncing dialogs for Account #{account.id} ({account.phone}): {e}")
    finally:
        try:
            await client.stop()
        except Exception:
            pass

    return new_messages_count

async def sync_all_accounts_dialogs() -> Dict[str, Any]:
    """Sync dialogs for all active Telegram accounts."""
    async with async_session() as session:
        result = await session.execute(
            select(Account).options(selectinload(Account.proxy)).where(Account.session_string.isnot(None))
        )
        accounts = result.scalars().all()

    total_imported = 0
    synced_accounts = 0
    for account in accounts:
        try:
            count = await sync_dialogs_for_account(account)
            total_imported += count
            synced_accounts += 1
        except Exception as e:
            logger.error(f"Failed to sync account {account.id}: {e}")

    return {
        "status": "ok",
        "synced_accounts": synced_accounts,
        "total_messages": total_imported
    }

async def send_inbox_message(
    account_id: int,
    peer_id: int,
    text: str,
    file: Optional[UploadFile] = None
) -> Dict[str, Any]:
    """Send a direct message (DM) from an account to a target peer in Telegram."""
    async with async_session() as session:
        result = await session.execute(
            select(Account).options(selectinload(Account.proxy)).where(Account.id == account_id)
        )
        account = result.scalars().first()
        if not account:
            raise ValueError(f"Account #{account_id} not found")

    client = get_hydrogram_client(account, account.proxy)
    try:
        await client.start()
        
        sent_media_path = None
        if file and file.filename:
            # Save temporary file to disk for hydrogram upload
            temp_dir = tempfile.gettempdir()
            temp_path = os.path.join(temp_dir, file.filename)
            content = await file.read()
            with open(temp_path, "wb") as f:
                f.write(content)
            
            if file.content_type and "image" in file.content_type:
                sent_msg = await client.send_photo(chat_id=peer_id, photo=temp_path, caption=text)
            else:
                sent_msg = await client.send_document(chat_id=peer_id, document=temp_path, caption=text)
            sent_media_path = temp_path
        else:
            sent_msg = await client.send_message(chat_id=peer_id, text=text)

        # Retrieve peer information if possible
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

        # Save outgoing message to DB
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
                created_at=datetime.utcnow()
            )
            session.add(msg_obj)
            await session.commit()
            await session.refresh(msg_obj)

        return {"status": "ok", "message_id": msg_obj.id}

    finally:
        try:
            await client.stop()
        except Exception:
            pass
