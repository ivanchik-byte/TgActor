import os
import logging
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

def _get_fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY")
    if not key:
        raise ValueError("ENCRYPTION_KEY environment variable is not set!")
    return Fernet(key.encode('utf-8'))

def encrypt_session(session_string: str) -> str:
    """Encrypts a Telegram session string."""
    f = _get_fernet()
    return f.encrypt(session_string.encode('utf-8')).decode('utf-8')

def decrypt_session(encrypted_session_string: str) -> str:
    """Decrypts a Telegram session string."""
    f = _get_fernet()
    return f.decrypt(encrypted_session_string.encode('utf-8')).decode('utf-8')
