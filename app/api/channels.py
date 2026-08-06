from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import async_session
from app.models.models import MonitoredChannel
from app.models.schemas import MonitoredChannelCreate, MonitoredChannelResponse

router = APIRouter()

@router.get("/api/channels", response_model=List[MonitoredChannelResponse])
async def get_channels():
    async with async_session() as session:
        result = await session.execute(select(MonitoredChannel).order_by(MonitoredChannel.id.asc()))
        return result.scalars().all()

@router.post("/api/channels")
async def create_channel(ch: MonitoredChannelCreate):
    async with async_session() as session:
        channel = MonitoredChannel(**ch.model_dump())
        session.add(channel)
        await session.commit()
        return {"status": "ok", "id": channel.id}

@router.delete("/api/channels/{channel_id}")
async def delete_channel(channel_id: int):
    async with async_session() as session:
        ch = await session.get(MonitoredChannel, channel_id)
        if not ch:
            raise HTTPException(404, "Channel not found")
        await session.delete(ch)
        await session.commit()
        return {"status": "ok"}
