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
    no_repeat = bool(payload.get("no_repeat_scenarios", True))

    execution_mode = str(payload.get("execution_mode") or "scenario")
    sender_account_id = payload.get("sender_account_id")
    send_as_mode = str(payload.get("send_as_mode") or "account")
    send_as_channel_username = payload.get("send_as_channel_username")
    custom_prompt = payload.get("custom_prompt")
    ai_model = payload.get("ai_model")
    skip_ads = bool(payload.get("skip_ads", True))

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
                no_repeat_scenarios=no_repeat,
                execution_mode=execution_mode,
                sender_account_id=sender_account_id,
                send_as_mode=send_as_mode,
                send_as_channel_username=send_as_channel_username,
                custom_prompt=custom_prompt,
                ai_model=ai_model,
                skip_ads=skip_ads
            )
            session.add(channel)
            await session.flush()
            added_ids.append(channel.id)

        await session.commit()

        # If auto-join is requested, trigger background smooth join for these channels
        auto_join_bots = bool(payload.get("auto_join_bots", False))
        auto_join_count = int(payload.get("auto_join_count") or 3)
        if auto_join_bots and lines:
            try:
                from app.services.join_service import start_smooth_join
                from app.services.pool_service import get_commenting_pool
                from app.models.models import Account
                accounts = await get_commenting_pool(session)
                if not accounts:
                    stmt_all = select(Account).where(Account.is_active == True)
                    res_all = await session.execute(stmt_all)
                    accounts = res_all.scalars().all()
                if accounts:
                    target_accs = accounts[:auto_join_count]
                    await start_smooth_join(
                        chat_links=lines,
                        account_ids=[a.id for a in target_accs],
                        min_delay=15,
                        max_delay=45
                    )
            except Exception as e:
                logger.error(f"Error starting auto smooth join on channel creation: {e}")

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
            ch.no_repeat_scenarios = bool(payload["no_repeat_scenarios"])
        if "execution_mode" in payload:
            ch.execution_mode = str(payload["execution_mode"])
        if "sender_account_id" in payload:
            ch.sender_account_id = payload["sender_account_id"]
        if "send_as_mode" in payload:
            ch.send_as_mode = str(payload["send_as_mode"])
        if "send_as_channel_username" in payload:
            ch.send_as_channel_username = payload["send_as_channel_username"]
        if "custom_prompt" in payload:
            ch.custom_prompt = payload["custom_prompt"]
        if "ai_model" in payload:
            ch.ai_model = payload["ai_model"]
        if "skip_ads" in payload:
            ch.skip_ads = bool(payload["skip_ads"])

        await session.commit()
        return {"status": "ok"}

@router.post("/api/channels/verify-send-as")
async def verify_send_as_channel(payload: Dict[str, Any] = Body(...)):
    """Verify if a specific account can post as a given channel."""
    account_id = payload.get("account_id")
    channel_username = str(payload.get("channel_username") or "").strip()

    if not account_id:
        raise HTTPException(400, "Выберите аккаунт для проверки")
    if not channel_username:
        raise HTTPException(400, "Укажите юзернейм канала (@channel)")

    async with async_session() as session:
        from app.models.models import Account
        account = await session.get(Account, account_id)
        if not account:
            raise HTTPException(404, "Аккаунт не найден")

        from app.services.first_comment_service import check_channel_send_as_permission
        result = await check_channel_send_as_permission(account, channel_username)
        return result

@router.delete("/api/channels/{channel_id}")
async def delete_channel(channel_id: int):
    """Remove channel from monitoring."""
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

# Smooth Fleet Joiner Endpoints
@router.get("/api/channels/smooth-join/status")
async def get_smooth_join_status_endpoint():
    from app.services.join_service import get_join_status
    return get_join_status()

@router.post("/api/channels/smooth-join/start")
async def start_smooth_join_endpoint(payload: Dict[str, Any] = Body(...)):
    from app.services.join_service import start_smooth_join
    from app.services.pool_service import get_commenting_pool
    from app.models.models import Account

    raw_links = str(payload.get("chat_links") or payload.get("chat_link") or "").strip()
    account_ids = payload.get("account_ids")
    account_count = int(payload.get("account_count") or 0)
    min_delay = int(payload.get("min_delay") or 30)
    max_delay = int(payload.get("max_delay") or 90)

    if not raw_links:
        raise HTTPException(400, "Укажите ссылку на канал или группу (например, t.me/example)")

    links = [l.strip() for l in raw_links.replace(",", "\n").split("\n") if l.strip()]

    async with async_session() as session:
        if not account_ids:
            # Query active commenting accounts
            accounts = await get_commenting_pool(session)
            if not accounts:
                # Fallback to any active accounts
                stmt_all = select(Account).where(Account.is_active == True)
                res_all = await session.execute(stmt_all)
                accounts = res_all.scalars().all()

            if not accounts:
                raise HTTPException(400, "Нет активных Telegram аккаунтов для входа в группу")

            if account_count > 0:
                accounts = accounts[:account_count]

            account_ids = [a.id for a in accounts]

    res = await start_smooth_join(
        chat_links=links,
        account_ids=account_ids,
        min_delay=min_delay,
        max_delay=max_delay
    )
    return res

@router.post("/api/channels/smooth-join/cancel")
async def cancel_smooth_join_endpoint():
    from app.services.join_service import cancel_smooth_join
    success = await cancel_smooth_join()
    return {"status": "ok", "cancelled": success}

