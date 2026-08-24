from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
import os
from app.core.config import ENABLE_CHANNEL_MONITOR, ENABLE_INBOX_LISTENER
from app.core.database import ensure_db_schema_sync, redis_client
from app.core.security import verify_auth_token
from app.workers.channel_monitor import start_channel_monitor, stop_channel_monitor
from app.workers.inbox_listener import start_inbox_listeners, stop_inbox_listeners

logger = logging.getLogger(__name__)

router = APIRouter()

active_websockets: set[WebSocket] = set()

async def broadcast_inbox_event(event_dict: dict):
    """Deliver an inbox event via Redis pubsub.

    Connected sockets receive events through their own Redis subscription,
    so no direct send here (that would duplicate every event).
    """
    payload = json.dumps(event_dict)
    try:
        await redis_client.publish("inbox_events", payload)
    except Exception as e:
        logger.warning(f"Redis publish inbox event failed: {e}")

async def lifespan(app):
    port = os.getenv("PORT", "8000")
    logger.info("==================================================")
    logger.info(f"TgActor Backend v3.3.0 — Successfully started!")
    logger.info(f"Dashboard available at: http://localhost:{port}")
    logger.info("==================================================")

    # Warn loudly on insecure default configuration
    from app.core import config as _cfg
    if _cfg.ADMIN_PASSWORD in ("admin", "admin123", "password", "1723"):
        logger.warning("SECURITY WARNING: ADMIN_PASSWORD uses a default value. Set a strong password in .env!")
    if _cfg.SECRET_KEY in ("tgactor-secret-key-replace-in-production", "jwt-secret-key"):
        logger.warning("SECURITY WARNING: SECRET_KEY uses a default value. Sessions are NOT secure. Set SECRET_KEY in .env!")

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
async def inbox_websocket_endpoint(websocket: WebSocket, token: str = ""):
    # Reject unauthenticated sockets before accepting
    if not verify_auth_token(token):
        await websocket.close(code=4401)
        return
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
