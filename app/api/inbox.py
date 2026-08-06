from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import async_session
from app.models.models import InboxMessage

router = APIRouter()

class SendMessageRequest(BaseModel):
    account_id: int
    peer_id: int
    text: str

@router.get("/api/inbox/chats")
async def get_inbox_chats():
    async with async_session() as session:
        stmt = select(InboxMessage.account_id, InboxMessage.peer_id, InboxMessage.peer_name, InboxMessage.peer_username).distinct()
        result = await session.execute(stmt)
        chats = []
        for row in result.all():
            chats.append({
                "account_id": row.account_id,
                "peer_id": row.peer_id,
                "peer_name": row.peer_name,
                "peer_username": row.peer_username
            })
        return chats

@router.get("/api/inbox/messages")
async def get_inbox_messages(account_id: int, peer_id: int):
    async with async_session() as session:
        stmt = select(InboxMessage).where(
            InboxMessage.account_id == account_id,
            InboxMessage.peer_id == peer_id
        ).order_by(InboxMessage.created_at.asc())
        result = await session.execute(stmt)
        return result.scalars().all()
