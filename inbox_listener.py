import asyncio
import logging
import json
from typing import Dict, List, Optional
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

async def save_media_if_exists(client, message: Message, force: bool = False) -> tuple:
    """
    Downloads media from the Telegram message and returns (media_type, relative_media_path).
    If force is False and media is larger than 2MB, it returns (media_type, None).
    """
    import os
    import shutil
    
    media_type = None
    media_obj = None
    
    if message.photo:
        media_type = "photo"
        media_obj = message.photo
    elif message.video:
        media_type = "video"
        media_obj = message.video
    elif message.voice:
        media_type = "voice"
        media_obj = message.voice
    elif message.audio:
        media_type = "audio"
        media_obj = message.audio
    elif message.sticker:
        media_type = "sticker"
        media_obj = message.sticker
    elif message.animation:
        media_type = "animation"
        media_obj = message.animation
    elif message.document:
        media_type = "document"
        media_obj = message.document
        
    if not media_type or not media_obj:
        return None, None
        
    # Skip auto-download for outgoing media to save server disk space (can download on-demand)
    if message.outgoing and not force:
        logger.info(f"Skipping auto-download for outgoing media in message {message.id}")
        return media_type, None
        
    # Check file size limit (2 MB) for incoming media
    file_size = getattr(media_obj, "file_size", 0) or 0
    if file_size > 2 * 1024 * 1024 and not force:
        logger.info(f"Media file size ({file_size} bytes) exceeds limit, skipping auto-download for message {message.id}")
        return media_type, None

    try:
        os.makedirs("/app/media", exist_ok=True)
        file_path = await client.download_media(message)
        if file_path and os.path.exists(file_path):
            filename = os.path.basename(file_path)
            dest_path = os.path.join("/app/media", filename)
            shutil.move(file_path, dest_path)
            return media_type, f"/media/{filename}"
    except Exception as e:
        logger.error(f"Error downloading media for message {message.id}: {e}")
        
    return media_type, None

async def _message_handler(client: TelegramSessionClient, account_id: int, message: Message):
    """
    Handles incoming/outgoing messages for a specific account.
    Filters out groups/channels, except private messages.
    """
    if hasattr(message.chat, 'type') and message.chat.type != hydrogram.enums.ChatType.PRIVATE:
        return
    
    is_incoming = not message.outgoing
    sender_id = message.from_user.id if message.from_user else message.chat.id
    sender_username = message.from_user.username if message.from_user else None
    text = message.text or message.caption or ""
    
    media_type, media_path = await save_media_if_exists(client.client, message)
    
    async with async_session() as session:
        inbox_msg = InboxMessage(
            account_id=account_id,
            peer_id=sender_id,
            message_id=message.id,
            sender_username=sender_username,
            text=text,
            is_incoming=is_incoming,
            media_type=media_type,
            media_path=media_path
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
            "is_incoming": is_incoming,
            "timestamp": inbox_msg.received_at.isoformat(),
            "media_type": media_type,
            "media_path": media_path
        }
        
        await redis_client.publish("inbox_events", json.dumps(payload))
        logger.info(f"Аккаунт {account_id} обновил ЛС от {sender_id}. Направление: {'входящее' if is_incoming else 'исходящее'}. Медиа: {media_type}")


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
            
            try:
                # Fetch last 20 messages from latest to oldest
                messages = []
                async for message in client.get_chat_history(chat_id=peer_id, limit=20):
                    messages.append(message)
                
                # Reverse list to process oldest first (chronological order)
                messages.reverse()
                
                for message in messages:
                    text = message.text or message.caption or ""
                    is_incoming = not message.outgoing
                    received_at = message.date or datetime.utcnow()
                    
                    async with async_session() as session:
                        stmt = select(InboxMessage).where(
                            InboxMessage.account_id == account_id,
                            InboxMessage.peer_id == peer_id,
                            InboxMessage.message_id == message.id
                        )
                        res = await session.execute(stmt)
                        existing = res.scalar_one_or_none()
                        
                        if not existing:
                            media_type, media_path = await save_media_if_exists(client, message)
                            inbox_msg = InboxMessage(
                                account_id=account_id,
                                peer_id=peer_id,
                                message_id=message.id,
                                sender_username=username,
                                text=text,
                                is_incoming=is_incoming,
                                received_at=received_at,
                                media_type=media_type,
                                media_path=media_path
                            )
                            session.add(inbox_msg)
                            await session.commit()
            except Exception as chat_err:
                logger.error(f"Ошибка при синхронизации истории чата с {peer_id} для аккаунта {account_id}: {chat_err}")
                
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

cleanup_task: Optional[asyncio.Task] = None

async def media_cleanup_task():
    """
    Background loop that runs daily to delete downloaded media files older than 7 days
    and resets their paths in the database.
    """
    from datetime import datetime, timedelta
    import os
    
    logger.info("Запуск фоновой службы очистки медиафайлов...")
    while True:
        try:
            # Run every 24 hours
            await asyncio.sleep(86400)
            
            cutoff_date = datetime.utcnow() - timedelta(days=7)
            logger.info(f"Запуск очистки медиа. Порог: {cutoff_date}")
            
            async with async_session() as session:
                # Select all inbox messages older than 7 days with downloaded media
                stmt = select(InboxMessage).where(
                    InboxMessage.received_at < cutoff_date,
                    InboxMessage.media_path.is_not(None)
                )
                res = await session.execute(stmt)
                old_messages = res.scalars().all()
                
                cleaned_count = 0
                for msg in old_messages:
                    if msg.media_path:
                        filename = os.path.basename(msg.media_path)
                        full_path = os.path.join("/app/media", filename)
                        
                        try:
                            if os.path.exists(full_path):
                                os.remove(full_path)
                                logger.info(f"Удален файл медиа: {full_path}")
                        except Exception as file_err:
                            logger.error(f"Не удалось удалить файл {full_path}: {file_err}")
                        
                        msg.media_path = None
                        cleaned_count += 1
                
                if cleaned_count > 0:
                    await session.commit()
                    logger.info(f"Очищено {cleaned_count} медиафайлов старше 7 дней.")
                    
        except asyncio.CancelledError:
            logger.info("Фоновая служба очистки медиа остановлена.")
            break
        except Exception as e:
            logger.error(f"Ошибка в фоновой службе очистки медиа: {e}")
            await asyncio.sleep(60)

async def start_listeners():
    """
    Starts listening on all active accounts.
    """
    global cleanup_task
    logger.info("Запуск слушателей Inbox Daemon...")
    
    if not cleanup_task:
        cleanup_task = asyncio.create_task(media_cleanup_task())
    
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
    global cleanup_task
    logger.info("Остановка слушателей Inbox Daemon...")
    
    if cleanup_task:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        cleanup_task = None
        
    for acc_id, client in active_clients.items():
        try:
            await client.stop()
            logger.info(f"Слушатель остановлен для аккаунта {acc_id}")
        except Exception as e:
            logger.error(f"Ошибка при остановке слушателя {acc_id}: {e}")
    
    active_clients.clear()
    await redis_client.aclose()
