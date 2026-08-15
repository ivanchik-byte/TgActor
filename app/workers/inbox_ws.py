from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
import os
from app.core.config import ENABLE_CHANNEL_MONITOR, ENABLE_INBOX_LISTENER
from app.core.database import ensure_db_schema_sync, redis_client
from app.workers.channel_monitor import start_channel_monitor, stop_channel_monitor
from app.workers.inbox_listener import start_inbox_listeners, stop_inbox_listeners

logger = logging.getLogger(__name__)

router = APIRouter()

active_websockets: set[WebSocket] = set()

async def broadcast_inbox_event(event_dict: dict):
    """Broadcast an inbox event to Redis pubsub and all connected WebSocket clients."""
    payload = json.dumps(event_dict)
    try:
        await redis_client.publish("inbox_events", payload)
    except Exception as e:
        logger.debug(f"Redis publish inbox event warning: {e}")

    for ws in list(active_websockets):
        try:
            await ws.send_text(payload)
        except Exception:
            active_websockets.discard(ws)

async def lifespan(app):
    port = os.getenv("PORT", "8000")
    logger.info("==================================================")
    logger.info(f"TgActor Backend v2.2.2 — Successfully started!")
    logger.info(f"Dashboard available at: http://localhost:{port}")
    logger.info("==================================================")

    # Ensure database schema alignment on startup
    await ensure_db_schema_sync()

    if ENABLE_CHANNEL_MONITOR:
        await start_channel_monitor()
    else:
        logger.info("Channel monitor daemon is disabled (ENABLE_CHANNEL_MONITOR=false)")

    if ENABLE_INBOX_LISTENER:
        await start_inbox_listeners()
    else:
        logger.info("Inbox listeners daemon is disabled (ENABLE_INBOX_LISTENER=false)")

    yield

    if ENABLE_CHANNEL_MONITOR:
        await stop_channel_monitor()
    if ENABLE_INBOX_LISTENER:
        await stop_inbox_listeners()

@router.websocket("/ws/inbox")
async def inbox_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    try:
        pubsub = redis_client.pubsub()
        await pubsub.subscribe("inbox_events")
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                await websocket.send_text(data)
    except WebSocketDisconnect:
        active_websockets.discard(websocket)
    except Exception as e:
        logger.debug(f"WebSocket client disconnected or error: {e}")
        active_websockets.discard(websocket)
