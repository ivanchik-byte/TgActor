from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import async_session
from app.models.models import InboxMessage, Account
from app.services.inbox_service import sync_all_accounts_dialogs, sync_dialogs_for_account, send_inbox_message

router = APIRouter()

@router.get("/api/inbox/chats")
async def get_inbox_chats():
    """
    Get grouped chat dialog list enriched with account details and latest message timestamp.
    If database has no dialogs, auto-triggers a background sync across accounts.
    """
    async with async_session() as session:
        # Select distinct account_id and peer_id pairs with latest message details
        subq = (
            select(
                InboxMessage.account_id,
                InboxMessage.peer_id,
                func.max(InboxMessage.id).label("max_id")
            )
            .group_by(InboxMessage.account_id, InboxMessage.peer_id)
            .subquery()
        )

        stmt = (
            select(InboxMessage, Account)
            .join(subq, (InboxMessage.account_id == subq.c.account_id) & (InboxMessage.peer_id == subq.c.peer_id) & (InboxMessage.id == subq.c.max_id))
            .join(Account, InboxMessage.account_id == Account.id)
            .order_by(desc(InboxMessage.created_at))
        )
        
        result = await session.execute(stmt)
        chats = []
        for msg, acc in result.all():
            u_name = (msg.peer_username or "").lower()
            p_name = (msg.peer_name or "").lower()
            if u_name.endswith("bot") or u_name in ["telegram", "wallet"] or msg.peer_id in [777000, 42777] or "bot" in p_name:
                continue

            chats.append({
                "account_id": msg.account_id,
                "peer_id": msg.peer_id,
                "peer_name": msg.peer_name,
                "peer_username": msg.peer_username,
                "sender_username": msg.peer_username or msg.peer_name,
                "account_username": acc.username,
                "account_phone": acc.phone,
                "account_name": f"{acc.first_name or ''} {acc.last_name or ''}".strip() or acc.phone,
                "account_custom_name": getattr(acc, 'custom_name', None),
                "last_message": msg.text,
                "updated_at": msg.created_at.isoformat() if msg.created_at else None
            })

        # If database inbox is empty, perform a sync attempt
        if not chats:
            # Sync dialogs in background if empty
            await sync_all_accounts_dialogs()
            
            # Re-query after sync
            result = await session.execute(stmt)
            for msg, acc in result.all():
                chats.append({
                    "account_id": msg.account_id,
                    "peer_id": msg.peer_id,
                    "peer_name": msg.peer_name,
                    "peer_username": msg.peer_username,
                    "sender_username": msg.peer_username or msg.peer_name,
                    "account_username": acc.username,
                    "account_phone": acc.phone,
                    "account_name": f"{acc.first_name or ''} {acc.last_name or ''}".strip() or acc.phone,
                    "account_custom_name": getattr(acc, 'custom_name', None),
                    "last_message": msg.text,
                    "updated_at": msg.created_at.isoformat() if msg.created_at else None
                })

        return chats

@router.api_route("/api/inbox/sync", methods=["GET", "POST"])
async def sync_inbox_chats():
    """Manual sync trigger to fetch latest Telegram chats and messages."""
    res = await sync_all_accounts_dialogs()
    return res

@router.get("/api/inbox/messages/{account_id}/{peer_id}")
async def get_inbox_messages_path(account_id: int, peer_id: int):
    """Get chat message history for specific account and peer."""
    async with async_session() as session:
        stmt = select(InboxMessage).where(
            InboxMessage.account_id == account_id,
            InboxMessage.peer_id == peer_id
        ).order_by(InboxMessage.created_at.asc())
        result = await session.execute(stmt)
        messages = result.scalars().all()
        return [
            {
                "id": m.id,
                "account_id": m.account_id,
                "peer_id": m.peer_id,
                "peer_name": m.peer_name,
                "peer_username": m.peer_username,
                "incoming": m.incoming,
                "is_incoming": m.incoming,
                "text": m.text,
                "media_path": m.media_path,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in messages
        ]

@router.get("/api/inbox/messages")
async def get_inbox_messages_query(account_id: int, peer_id: int):
    """Fallback query endpoint for message history."""
    return await get_inbox_messages_path(account_id, peer_id)

@router.post("/api/inbox/send")
async def send_inbox_message_endpoint(
    account_id: int = Form(...),
    peer_id: int = Form(...),
    text: str = Form(""),
    file: Optional[UploadFile] = File(None)
):
    """Send outgoing DM or file to a chat from specified account."""
    try:
        res = await send_inbox_message(account_id=account_id, peer_id=peer_id, text=text, file=file)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/inbox/download-media/{message_id}")
async def download_inbox_media(message_id: int):
    """Dummy or actual media download endpoint."""
    async with async_session() as session:
        msg = await session.get(InboxMessage, message_id)
        if not msg:
            raise HTTPException(404, detail="Сообщение не найдено")
        return {"status": "ok", "media_path": msg.media_path or ""}
