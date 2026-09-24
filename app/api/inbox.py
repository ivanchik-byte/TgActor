from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import async_session
from app.models.models import InboxMessage, Account
from app.services.inbox_service import (
    sync_all_accounts_dialogs,
    sync_dialogs_for_account,
    clear_inbox_sync,
    send_inbox_message,
    edit_inbox_message,
    delete_inbox_message,
    download_media_for_message
)

router = APIRouter()

class EditMessageRequest(BaseModel):
    account_id: int
    peer_id: int
    message_id: int
    new_text: str

class DeleteMessageRequest(BaseModel):
    account_id: int
    peer_id: int
    message_id: int

@router.get("/api/inbox/chats")
async def get_inbox_chats(account_id: Optional[int] = None, limit: int = 200):
    async with async_session() as session:
        subq = (
            select(
                InboxMessage.account_id,
                InboxMessage.peer_id,
                func.max(InboxMessage.id).label("max_id")
            )
            .where(InboxMessage.peer_id.notin_([777000, 42777]))
            .group_by(InboxMessage.account_id, InboxMessage.peer_id)
            .subquery()
        )
        if account_id is not None:
            subq = (
                select(
                    InboxMessage.account_id,
                    InboxMessage.peer_id,
                    func.max(InboxMessage.id).label("max_id")
                )
                .where(InboxMessage.account_id == account_id)
                .where(InboxMessage.peer_id.notin_([777000, 42777]))
                .group_by(InboxMessage.account_id, InboxMessage.peer_id)
                .subquery()
            )

        query = (
            select(InboxMessage, Account)
            .join(subq, (InboxMessage.account_id == subq.c.account_id) & (InboxMessage.peer_id == subq.c.peer_id) & (InboxMessage.id == subq.c.max_id))
            .join(Account, InboxMessage.account_id == Account.id)
            .order_by(desc(InboxMessage.created_at))
            .limit(min(limit, 500))
        )

        result = await session.execute(query)
        chats = []
        for msg, acc in result.all():
            u_name = (msg.peer_username or "").lower()
            if u_name in ["telegram", "wallet"]:
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

        return chats

@router.api_route("/api/inbox/sync", methods=["GET", "POST"])
async def sync_inbox_chats():
    res = await sync_all_accounts_dialogs()
    return res

@router.post("/api/inbox/sync/{account_id}")
async def sync_inbox_for_single_account(account_id: int):
    count = await sync_dialogs_for_account(account_id)
    return {"status": "ok", "account_id": account_id, "imported_messages": count}

@router.delete("/api/inbox/sync")
async def clear_all_inbox_sync():
    return await clear_inbox_sync(account_id=None)

@router.delete("/api/inbox/sync/{account_id}")
async def clear_account_inbox_sync(account_id: int):
    return await clear_inbox_sync(account_id=account_id)

@router.get("/api/inbox/messages/{account_id}/{peer_id}")
async def get_inbox_messages_path(account_id: int, peer_id: int, limit: int = 100, before_id: Optional[int] = None):
    async with async_session() as session:
        stmt = select(InboxMessage).where(
            InboxMessage.account_id == account_id,
            InboxMessage.peer_id == peer_id
        )
        if before_id is not None:
            stmt = stmt.where(InboxMessage.id < before_id)
        stmt = stmt.order_by(InboxMessage.id.desc()).limit(min(limit, 200))
        result = await session.execute(stmt)
        messages = list(result.scalars().all())
        messages.reverse()
        return [
            {
                "id": m.id,
                "message_id": m.message_id,
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
async def get_inbox_messages_query(account_id: int, peer_id: int, limit: int = 100, before_id: Optional[int] = None):
    return await get_inbox_messages_path(account_id, peer_id, limit, before_id)

@router.post("/api/inbox/send")
async def send_inbox_message_endpoint(
    account_id: int = Form(...),
    peer_id: int = Form(...),
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),
    reply_to_msg_id: Optional[int] = Form(None)
):
    try:
        res = await send_inbox_message(
            account_id=account_id, 
            peer_id=peer_id, 
            text=text, 
            file=file,
            reply_to_msg_id=reply_to_msg_id
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/inbox/edit")
async def edit_inbox_message_endpoint(req: EditMessageRequest):
    try:
        res = await edit_inbox_message(
            account_id=req.account_id,
            peer_id=req.peer_id,
            message_id=req.message_id,
            new_text=req.new_text
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/inbox/delete")
async def delete_inbox_message_endpoint(req: DeleteMessageRequest):
    try:
        res = await delete_inbox_message(
            account_id=req.account_id,
            peer_id=req.peer_id,
            message_id=req.message_id
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/inbox/download-media/{message_id}")
async def download_inbox_media(message_id: int):
    try:
        media_url = await download_media_for_message(message_id)
        return {"status": "ok", "media_path": media_url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
