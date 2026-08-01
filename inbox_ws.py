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

@app.websocket("/ws/inbox")
async def websocket_endpoint(websocket: WebSocket):
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

@app.post("/api/inbox/send")
async def send_direct_message(req: SendMessageRequest):
    client = active_clients.get(req.account_id)
    if not client:
        raise HTTPException(status_code=404, detail="Клиент аккаунта не запущен или отключен.")
        
    try:
        msg = await client.client.send_message(chat_id=req.peer_id, text=req.text)
        
        async with async_session() as session:
            out_msg = InboxMessage(
                account_id=req.account_id,
                peer_id=req.peer_id,
                message_id=msg.id if hasattr(msg, 'id') else 0,
                text=req.text,
                is_incoming=False
            )
            session.add(out_msg)
            await session.commit()
            await session.refresh(out_msg)
            
            payload = {
                "account_id": req.account_id,
                "peer_id": req.peer_id,
                "message_id": out_msg.message_id,
                "sender_username": "me",
                "text": req.text,
                "is_incoming": False,
                "timestamp": out_msg.received_at.isoformat()
            }
            await redis_pubsub_client.publish("inbox_events", json.dumps(payload))
            
        return {"status": "success", "message_id": out_msg.message_id}
    except Exception as e:
        logger.error(f"Не удалось отправить ЛС: {e}")
        raise HTTPException(status_code=500, detail=str(e))
