import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
import redis.asyncio as redis
from sqlalchemy import select

from inbox_listener import start_listeners, stop_listeners, active_clients, async_session, REDIS_URL
from models import InboxMessage

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the daemon in the background
    task = asyncio.create_task(start_listeners())
    yield
    # Stop the daemon
    await stop_listeners()
    await task

app = FastAPI(lifespan=lifespan)
# Independent redis client for the FastAPI app
redis_pubsub_client = redis.from_url(REDIS_URL)

class SendMessageRequest(BaseModel):
    account_id: int
    peer_id: int
    text: str

import hmac
import hashlib
import os

@app.websocket("/ws/inbox")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "1723")
    enc_key = os.environ.get("ENCRYPTION_KEY", "fallback")
    expected_token = hmac.new(enc_key.encode(), admin_pwd.encode(), hashlib.sha256).hexdigest()
    
    if not token or not hmac.compare_digest(token.encode('utf-8'), expected_token.encode('utf-8')):
        await websocket.close(code=4001)
        return
        
    await websocket.accept()
    pubsub = redis_pubsub_client.pubsub()
    await pubsub.subscribe("inbox_events")
    
    try:
        # listen() blocks, we use get_message to avoid blocking the event loop improperly in some async contexts,
        # but redis.asyncio pubsub.listen() is an async generator, so async for is perfect.
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"].decode("utf-8")
                await websocket.send_text(data)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    finally:
        await pubsub.unsubscribe("inbox_events")
        await pubsub.close()


