import logging
from typing import Optional, Tuple
from hydrogram import Client
from hydrogram.types import Chat
from hydrogram.errors import ChannelPrivate, ChatRestricted, PeerIdInvalid
from models import ScenarioStep

logger = logging.getLogger(__name__)

async def check_chat_availability(
    client: Client, 
    chat_id: int | str, 
    requires_media: bool = False
) -> Tuple[bool, Optional[str]]:
    """
    Checks if a target group/channel is accessible, allows messaging, and optionally media.
    Returns (success, error_message).
    """
    try:
        chat: Chat = await client.get_chat(chat_id)
    except (ChannelPrivate, ChatRestricted):
        return False, "Чат приватный или доступ ограничен."
    except PeerIdInvalid:
        return False, "Неверный ID чата."
    except Exception as e:
        return False, f"Не удалось получить доступ к чату: {e}"

    if getattr(chat, 'permissions', None):
        if not chat.permissions.can_send_messages:
            return False, "Отправка сообщений в этом чате запрещена."
        
        # Check media
        if requires_media:
            # Different versions of Pyrogram/Hydrogram store media permissions differently.
            # Usually can_send_media_messages
            can_media = getattr(chat.permissions, 'can_send_media_messages', True)
            if not can_media:
                return False, "Отправка медиа запрещена в этом чате."

    # Check if we need to comment under a channel post
    if chat.type and hasattr(chat.type, 'CHANNEL') and chat.type == chat.type.CHANNEL:
        if not getattr(chat, 'linked_chat', None):
            return False, "У канала нет привязанной группы для комментариев."
            
    return True, None
