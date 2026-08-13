from fastapi import APIRouter, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any, Optional

from app.core.database import async_session
from app.models.models import MonitoredChannel
from app.models.schemas import MonitoredChannelResponse
from app.workers.channel_monitor import is_monitor_running, start_channel_monitor, stop_channel_monitor

router = APIRouter()

@router.get("/api/channels", response_model=List[MonitoredChannelResponse])
async def get_channels():
    async with async_session() as session:
        result = await session.execute(select(MonitoredChannel).order_by(MonitoredChannel.id.asc()))
        return result.scalars().all()

@router.post("/api/channels")
async def create_channel(payload: Dict[str, Any] = Body(...)):
    """Add new monitored channels with sanitized username parsing."""
    raw_input = str(payload.get("channel_identifier") or payload.get("channel_username") or "").strip()
    min_delay = int(payload.get("min_delay_seconds") or 5)
    max_delay = int(payload.get("max_delay_seconds") or 10)
    no_repeat = payload.get("no_repeat_scenarios")
    no_repeat_val = 1 if (no_repeat is True or no_repeat == 1 or no_repeat is None) else 0

    if not raw_input:
        raise HTTPException(400, "Укажите имя канала или ссылку t.me")

    # Split by lines or commas
    lines = [item.strip() for item in raw_input.replace(",", "\n").split("\n") if item.strip()]
    added_ids = []

    async with async_session() as session:
        for line in lines:
            # Clean link: https://t.me/ivanchik_byte -> ivanchik_byte
            clean_username = line.split("t.me/")[-1].replace("@", "").strip().split("/")[0]
            if not clean_username:
                continue

            existing = await session.execute(
                select(MonitoredChannel).where(MonitoredChannel.channel_username == clean_username)
            )
            if existing.scalars().first():
                continue

            channel = MonitoredChannel(
                channel_username=clean_username,
                is_active=True,
                min_delay_seconds=min_delay,
                max_delay_seconds=max_delay,
                no_repeat_scenarios=no_repeat_val
            )
            session.add(channel)
            await session.flush()
            added_ids.append(channel.id)

        await session.commit()
        return {"status": "ok", "added_ids": added_ids}

@router.patch("/api/channels/{channel_id}")
async def update_channel(channel_id: int, payload: Dict[str, Any] = Body(...)):
    """Update settings or toggle channel active state."""
    async with async_session() as session:
        ch = await session.get(MonitoredChannel, channel_id)
        if not ch:
            raise HTTPException(404, "Channel not found")

        if "is_active" in payload:
            ch.is_active = bool(payload["is_active"])
        if "min_delay_seconds" in payload:
            ch.min_delay_seconds = int(payload["min_delay_seconds"])
        if "max_delay_seconds" in payload:
            ch.max_delay_seconds = int(payload["max_delay_seconds"])
        if "no_repeat_scenarios" in payload:
            val = payload["no_repeat_scenarios"]
            ch.no_repeat_scenarios = 1 if (val is True or val == 1) else 0

        await session.commit()
        return {"status": "ok"}

@router.delete("/api/channels/{channel_id}")
async def delete_channel(channel_id: int):
    async with async_session() as session:
        ch = await session.get(MonitoredChannel, channel_id)
        if not ch:
            raise HTTPException(404, "Channel not found")
        await session.delete(ch)
        await session.commit()
        return {"status": "ok"}

# Channel Monitor Daemon Status Endpoints
@router.get("/api/channels/monitor/status")
@router.get("/api/monitor/status")
async def get_monitor_status():
    return {"running": is_monitor_running()}

@router.post("/api/channels/monitor/start")
async def start_monitor():
    await start_channel_monitor()
    return {"running": is_monitor_running()}

@router.post("/api/channels/monitor/stop")
async def stop_monitor():
    await stop_channel_monitor()
    return {"running": is_monitor_running()}
