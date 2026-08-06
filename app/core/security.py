import hmac
import hashlib
import base64
from cryptography.fernet import Fernet
from app.core.config import SECRET_KEY

_derived_key = hashlib.sha256(SECRET_KEY.encode()).digest()
_fernet_key = base64.urlsafe_b64encode(_derived_key)
cipher_suite = Fernet(_fernet_key)

def encrypt_session(session_string: str) -> str:
    if not session_string:
        return ""
    return cipher_suite.encrypt(session_string.encode()).decode()

def decrypt_session(encrypted_string: str) -> str:
    if not encrypted_string:
        return ""
    try:
        return cipher_suite.decrypt(encrypted_string.encode()).decode()
    except Exception:
        return encrypted_string

def check_password(plain_password: str) -> bool:
    from app.core.config import ADMIN_PASSWORD
    return hmac.compare_digest(plain_password.encode(), ADMIN_PASSWORD.encode())

def generate_auth_token(password: str) -> str:
    return hmac.new(SECRET_KEY.encode(), password.encode(), hashlib.sha256).hexdigest()
