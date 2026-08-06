import os
import asyncio
import logging
from cryptography.fernet import Fernet
from client import TelegramSessionClient
from security import encrypt_session

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def main():
    # 1. Setup Encryption
    if "ENCRYPTION_KEY" not in os.environ:
        key = Fernet.generate_key().decode('utf-8')
        os.environ["ENCRYPTION_KEY"] = key
        logger.info("Generated new ENCRYPTION_KEY for testing.")

    # 2. Encrypt session string
    # We use a dummy string here for the autonomous test.
    dummy_session = "1BVtsOKEBu..." 
    encrypted_session = encrypt_session(dummy_session)
    logger.info(f"Encrypted session string successfully. String is hidden.")
    
    # 3. Setup Proxy
    proxy = {
        "scheme": "socks5",
        "hostname": "127.0.0.1",
        "port": 9050,
        "username": "user",
        "password": "password"
    }
    
    # 4. Initialize Client
    client = TelegramSessionClient(
        encrypted_session=encrypted_session,
        proxy=proxy,
        api_id=12345,
        api_hash="0123456789abcdef0123456789abcdef"
    )
    
    # --- MOCKING METHODS FOR AUTONOMOUS TESTING ---
    async def mock_send_chat_action(chat_id, action):
        logger.info(f"MOCK API: Sending chat action {action} to {chat_id}")

    async def mock_send_message_success(chat_id, text, reply_to_message_id=None):
        logger.info(f"MOCK API: Sending message '{text}' to {chat_id}")
        return True

    from hydrogram.errors import FloodWait

    async def mock_send_message_flood(chat_id, text, reply_to_message_id=None):
        logger.info(f"MOCK API: Attempting to send message... simulating FloodWait")
        class FakeResponse:
            pass
        response = FakeResponse()
        response.x = 15 # Required for FloodWait instantiation in Pyrogram/Hydrogram
        raise FloodWait(value=15)

    client.client.send_chat_action = mock_send_chat_action
    client.client.send_message = mock_send_message_success
    # -----------------------------------------------

    logger.info("--- Testing Normal Message Delivery ---")
    await client.send_human_message("test_chat", "Hello, normal message!", delay_range=(0.5, 1.5))
    
    logger.info("\n--- Testing Artificial FloodWait ---")
    client.client.send_message = mock_send_message_flood
    await client.send_human_message("test_chat", "This should trigger flood wait", delay_range=(0.5, 1.5))
    
    logger.info(f"Client status is now: {client.status}")
    
    logger.info("\n--- Testing Message During Cooldown ---")
    # This should be aborted before sending
    await client.send_human_message("test_chat", "Will this send?", delay_range=(0.5, 1.5))
    
if __name__ == "__main__":
    asyncio.run(main())
