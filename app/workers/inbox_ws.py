from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
from app.core.database import redis_client
from app.workers.channel_monitor import start_channel_monitor, stop_channel_monitor
from app.workers.inbox_listener import start_inbox_listeners, stop_inbox_listeners

logger = logging.getLogger(__name__)

router = APIRouter()

active_websockets = set()

async def lifespan(app):
    await start_channel_monitor()
    await start_inbox_listeners()
    yield
    await stop_channel_monitor()
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
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        active_websockets.remove(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if websocket in active_websockets:
            active_websockets.remove(websocket)
