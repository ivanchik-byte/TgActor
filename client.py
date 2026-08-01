import asyncio
import logging
import random
from typing import Optional, Tuple
from hydrogram import Client
from hydrogram.enums import ChatAction
from hydrogram.errors import FloodWait, UserDeactivated, AuthKeyUnregistered
from security import decrypt_session

logger = logging.getLogger(__name__)

class TelegramSessionClient:
    def __init__(
        self,
        encrypted_session: str,
        proxy: Optional[dict] = None,
        api_id: Optional[int] = None,
        api_hash: Optional[str] = None
    ):
        self.encrypted_session = encrypted_session
        self.proxy = proxy
        self.status = "active"
        self.cooldown_until = 0.0

        try:
            session_string = decrypt_session(self.encrypted_session)
        except Exception as e:
            logger.error(f"Failed to decrypt session: {e}")
            raise

        client_kwargs = {
            "name": "tgcast_session",
            "session_string": session_string,
            "in_memory": True,
        }

        if api_id and api_hash:
            client_kwargs["api_id"] = api_id
            client_kwargs["api_hash"] = api_hash

        if self.proxy:
            client_kwargs["proxy"] = self.proxy
        else:
            logger.warning("DANGER: Running Telegram session without proxy! High risk of account restriction by Telegram.")

        self.client = Client(**client_kwargs)

    async def start(self):
        await self.client.start()

    async def stop(self):
        await self.client.stop()

    async def send_human_message(self, chat_id: int | str, text: str, reply_to_message_id: Optional[int] = None, delay_range: Tuple[float, float] = (3.0, 8.0)):
        if self.status != "active":
            logger.warning(f"Cannot send message, session status is: {self.status}")
            return None

        loop = asyncio.get_running_loop()
        if loop.time() < self.cooldown_until:
            logger.warning("Session is currently in cooldown.")
            return None

        try:
            await self.client.send_chat_action(chat_id, ChatAction.TYPING)
            
            delay = random.uniform(*delay_range)
            logger.info(f"Typing for {delay:.2f} seconds...")
            await asyncio.sleep(delay)
            
            msg = await self.client.send_message(
                chat_id=chat_id,
                text=text,
                reply_to_message_id=reply_to_message_id
            )
            logger.info("Message sent successfully.")
            return msg
            
        except FloodWait as e:
            wait_time = e.value
            self.cooldown_until = loop.time() + wait_time + 10.0
            self.status = "cooldown"
            logger.warning(f"FloodWait encountered. Setting cooldown for {wait_time + 10.0} seconds.")
        except (UserDeactivated, AuthKeyUnregistered) as e:
            self.status = "banned" if isinstance(e, UserDeactivated) else "invalid"
            logger.error(f"Session invalidated: {e.__class__.__name__}. Status set to {self.status}.")
        except Exception as e:
            logger.error(f"Unhandled error while sending message: {e}")
            # Instead of raising we log it, per instructions for MTProto global error handler.
            # But the requirement explicitly says "При искусственном вызове FloodWait логирует задержку и переходит в cooldown без unhandled traceback"
            pass
