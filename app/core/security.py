import hmac
import hashlib
import base64
import os
import time
from typing import List
from cryptography.fernet import Fernet
from app.core import config as _config
from app.core.config import SECRET_KEY, ENCRYPTION_KEY

class SessionDecryptError(RuntimeError):
    pass

_derived_key = hashlib.sha256(SECRET_KEY.encode()).digest()
_fernet_key = base64.urlsafe_b64encode(_derived_key)
cipher_suite = Fernet(_fernet_key)

# Build list of fallback Fernet suites
_fallback_suites: List[Fernet] = []

# If SECRET_KEY or ENCRYPTION_KEY is already a valid 32-byte base64 Fernet key
for raw_k in dict.fromkeys([SECRET_KEY, ENCRYPTION_KEY]):
    try:
        _fallback_suites.append(Fernet(raw_k.encode()))
    except Exception:
        pass

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
        pass
    for suite in _fallback_suites:
        try:
            return suite.decrypt(encrypted_string.encode()).decode()
        except Exception:
            continue
    raise SessionDecryptError("cannot decrypt session with active key")

def check_password(plain_password: str) -> bool:
    # Read live so runtime overrides (tests, env reload) are respected
    if not plain_password:
        return False
    admin_password = _config.ADMIN_PASSWORD
    if not admin_password:
        return False
    return hmac.compare_digest(plain_password.encode(), admin_password.encode())


# Token lifetime in seconds (30 days)
AUTH_TOKEN_TTL = int(os.getenv("AUTH_TOKEN_TTL", str(30 * 24 * 3600)))


def generate_auth_token(password: str) -> str:
    """Time-limited token: '<expires_at>.<hmac(secret, password:expires_at)>'."""
    expires_at = int(time.time()) + AUTH_TOKEN_TTL
    signature = hmac.new(
        SECRET_KEY.encode(),
        f"{password}:{expires_at}".encode(),
        hashlib.sha256
    ).hexdigest()
    return f"{expires_at}.{signature}"


def verify_auth_token(token: str) -> bool:
    """Validate token signature and expiration. Constant-time compare."""
    if not token or "." not in token:
        return False
    try:
        expires_part, signature = token.rsplit(".", 1)
        expires_at = int(expires_part)
    except ValueError:
        return False
    if expires_at < time.time():
        return False
    expected = hmac.new(
        SECRET_KEY.encode(),
        f"{_config.ADMIN_PASSWORD}:{expires_at}".encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

