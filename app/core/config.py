import os


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set")
    return value


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/tgactor.db")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
ADMIN_PASSWORD = _required("ADMIN_PASSWORD")
SECRET_KEY = os.getenv("SECRET_KEY", os.getenv("ENCRYPTION_KEY", "")).strip()
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY or ENCRYPTION_KEY is not set")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", SECRET_KEY)
JWT_SECRET = os.getenv("JWT_SECRET", SECRET_KEY)
FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip()

ENABLE_CHANNEL_MONITOR = os.getenv("ENABLE_CHANNEL_MONITOR", "true").lower() == "true"
ENABLE_INBOX_LISTENER = os.getenv("ENABLE_INBOX_LISTENER", "true").lower() == "true"

try:
    TELEGRAM_API_ID = int(os.getenv("TELEGRAM_API_ID", "2040"))
except ValueError:
    TELEGRAM_API_ID = 2040
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "b18441a1ed607415570faf839e64629b")
