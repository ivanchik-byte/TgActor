import asyncio
import logging
import json
from typing import Dict, List
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select

from models import Account, InboxMessage
from client import TelegramSessionClient
import redis.asyncio as redis
from hydrogram import filters
from hydrogram.types import Message
import hydrogram

logger = logging.getLogger(__name__)

DB_URL = "postgresql+asyncpg://tgcast:tgcast_password@localhost:5433/tgcast_db"
REDIS_URL = "redis://localhost:6380/0"

engine = create_async_engine(DB_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)

active_clients: Dict[int, TelegramSessionClient] = {}
redis_client = redis.from_url(REDIS_URL)

async def _message_handler(client: TelegramSessionClient, account_id: int, message: Message):
    """
    Handles incoming messages for a specific account.
    Filters out groups/channels, except private messages.
    """
    # Private check
    if hasattr(message.chat, 'type') and message.chat.type != hydrogram.enums.ChatType.PRIVATE:
        return
    
    sender_id = message.from_user.id if message.from_user else message.chat.id
    sender_username = message.from_user.username if message.from_user else None
    text = message.text or message.caption or ""
    
    # We want to catch all DMs including 777000 (Telegram)
    
    async with async_session() as session:
        inbox_msg = InboxMessage(
            account_id=account_id,
            peer_id=sender_id,
            message_id=message.id,
            sender_username=sender_username,
            text=text,
            is_incoming=True
        )
        session.add(inbox_msg)
        await session.commit()
        await session.refresh(inbox_msg)
        
        payload = {
            "account_id": account_id,
            "peer_id": sender_id,
            "message_id": message.id,
            "sender_username": sender_username,
            "text": text,
            "is_incoming": True,
            "timestamp": inbox_msg.received_at.isoformat()
        }
        
        await redis_client.publish("inbox_events", json.dumps(payload))
        logger.info(f"Аккаунт {account_id} получил ЛС от {sender_id}. Сохранено и отправлено в Redis.")


async def start_listeners():
    """
    Starts listening on all active accounts.
    """
    logger.info("Запуск слушателей Inbox Daemon...")
    
    async with async_session() as session:
        stmt = select(Account).where(Account.status == "active")
        accounts = (await session.execute(stmt)).scalars().all()
        
    for account in accounts:
        try:
            client = TelegramSessionClient(encrypted_session=account.encrypted_session)
            await client.start()
            
            # Register message handler with a closure to bind account_id
            def create_handler(acc_id, cli):
                async def on_new_message(hydro_client, message: Message):
                    await _message_handler(cli, acc_id, message)
                return on_new_message
            
            client.client.on_message(filters.private)(create_handler(account.id, client))
                
            active_clients[account.id] = client
            logger.info(f"Слушатель запущен для аккаунта {account.id}")
            
        except Exception as e:
            logger.error(f"Не удалось запустить слушатель для аккаунта {account.id}: {e}")
            # Mark disconnected to isolate failure
            async with async_session() as session:
                acc = await session.get(Account, account.id)
                if acc:
                    acc.status = "disconnected"
                    await session.commit()
            logger.info(f"Аккаунт {account.id} переведен в статус disconnected.")

async def stop_listeners():
    """
    Stops all active listeners gracefully.
    """
    logger.info("Остановка слушателей Inbox Daemon...")
    for acc_id, client in active_clients.items():
        try:
            await client.stop()
            logger.info(f"Слушатель остановлен для аккаунта {acc_id}")
        except Exception as e:
            logger.error(f"Ошибка при остановке слушателя {acc_id}: {e}")
    
    active_clients.clear()
    await redis_client.aclose()
