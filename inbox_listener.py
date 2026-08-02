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

import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://tgcast:tgcast_password@localhost:5433/tgcast_db")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6380/0")

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


async def sync_recent_dialogs(client, account_id: int):
    from datetime import datetime
    import hydrogram
    try:
        logger.info(f"Синхронизация последних диалогов для аккаунта {account_id}...")
        async for dialog in client.get_dialogs(limit=30):
            if dialog.chat.type != hydrogram.enums.ChatType.PRIVATE:
                continue
                
            peer_id = dialog.chat.id
            username = dialog.chat.username or dialog.chat.first_name or str(peer_id)
            
            last_msg = dialog.top_message
            if last_msg:
                text = last_msg.text or last_msg.caption or ""
                is_incoming = last_msg.outgoing is False
                received_at = last_msg.date or datetime.utcnow()
                
                async with async_session() as session:
                    stmt = select(InboxMessage).where(
                        InboxMessage.account_id == account_id,
                        InboxMessage.peer_id == peer_id,
                        InboxMessage.message_id == last_msg.id
                    )
                    res = await session.execute(stmt)
                    existing = res.scalar_one_or_none()
                    
                    if not existing:
                        inbox_msg = InboxMessage(
                            account_id=account_id,
                            peer_id=peer_id,
                            message_id=last_msg.id,
                            sender_username=username,
                            text=text,
                            is_incoming=is_incoming,
                            received_at=received_at
                        )
                        session.add(inbox_msg)
                        await session.commit()
        logger.info(f"Диалоги для аккаунта {account_id} успешно синхронизированы.")
    except Exception as e:
        logger.error(f"Ошибка при синхронизации диалогов для {account_id}: {e}")

async def start_account_listener(account: Account):
    if account.id in active_clients:
        return
        
    try:
        proxy_dict = None
        if account.proxy:
            proxy_dict = {
                "scheme": account.proxy.protocol,
                "hostname": account.proxy.ip,
                "port": account.proxy.port,
            }
            if account.proxy.username:
                proxy_dict["username"] = account.proxy.username
                proxy_dict["password"] = account.proxy.password
                
        client = TelegramSessionClient(encrypted_session=account.encrypted_session, proxy=proxy_dict)
        await client.start()
        
        # Register message handler with a closure to bind account_id
        def create_handler(acc_id, cli):
            async def on_new_message(hydro_client, message: Message):
                await _message_handler(cli, acc_id, message)
            return on_new_message
        
        client.client.on_message(filters.private)(create_handler(account.id, client))
            
        active_clients[account.id] = client
        logger.info(f"Слушатель запущен для аккаунта {account.id}")
        
        # Start async task for background sync of recent chats
        asyncio.create_task(sync_recent_dialogs(client.client, account.id))
        
    except Exception as e:
        logger.error(f"Не удалось запустить слушатель для аккаунта {account.id}: {e}")
        # Mark disconnected to isolate failure
        async with async_session() as session:
            acc = await session.get(Account, account.id)
            if acc:
                acc.status = "disconnected"
                await session.commit()
        logger.info(f"Аккаунт {account.id} переведен в статус disconnected.")

async def stop_account_listener(account_id: int):
    client = active_clients.pop(account_id, None)
    if client:
        try:
            await client.stop()
            logger.info(f"Слушатель остановлен для аккаунта {account_id}")
        except Exception as e:
            logger.error(f"Ошибка при остановке слушателя {account_id}: {e}")

async def start_listeners():
    """
    Starts listening on all active accounts.
    """
    logger.info("Запуск слушателей Inbox Daemon...")
    
    async with async_session() as session:
        from sqlalchemy.orm import selectinload
        stmt = select(Account).options(selectinload(Account.proxy)).where(Account.status == "active")
        accounts = (await session.execute(stmt)).scalars().all()
        
    for account in accounts:
        await start_account_listener(account)

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
