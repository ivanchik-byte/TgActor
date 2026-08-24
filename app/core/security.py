import hmac
import hashlib
import base64
import os
import time
from typing import List
from cryptography.fernet import Fernet
from app.core import config as _config
from app.core.config import SECRET_KEY, ENCRYPTION_KEY

# Primary cipher
_derived_key = hashlib.sha256(SECRET_KEY.encode()).digest()
_fernet_key = base64.urlsafe_b64encode(_derived_key)
cipher_suite = Fernet(_fernet_key)

# Build list of fallback Fernet suites
_fallback_suites: List[Fernet] = []

# If SECRET_KEY or ENCRYPTION_KEY is already a valid 32-byte base64 Fernet key
for raw_k in [SECRET_KEY, ENCRYPTION_KEY]:
    try:
        _fallback_suites.append(Fernet(raw_k.encode()))
    except Exception:
        pass

# Legacy default keys from previous versions / initial runs
_LEGACY_KEYS = [
    "tgactor-secret-key-replace-in-production",
    "admin",
    "jwt-secret-key",
    "secret",
    "default"
]

for lk in _LEGACY_KEYS:
    try:
        dk = hashlib.sha256(lk.encode()).digest()
        _fallback_suites.append(Fernet(base64.urlsafe_b64encode(dk)))
    except Exception:
        pass

def encrypt_session(session_string: str) -> str:
    if not session_string:
        return ""
    return cipher_suite.encrypt(session_string.encode()).decode()

def decrypt_session(encrypted_string: str) -> str:
    if not encrypted_string:
        return ""
    
    # 1. Try active primary cipher
    try:
        return cipher_suite.decrypt(encrypted_string.encode()).decode()
    except Exception:
        pass

    # 2. Try fallback suites
    for suite in _fallback_suites:
        try:
            return suite.decrypt(encrypted_string.encode()).decode()
        except Exception:
            pass

    # 3. If it's already plaintext session string (e.g. legacy or unencrypted)
    return encrypted_string

def check_password(plain_password: str) -> bool:
    # Read live so runtime overrides (tests, env reload) are respected
    return hmac.compare_digest(plain_password.encode(), _config.ADMIN_PASSWORD.encode())


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

