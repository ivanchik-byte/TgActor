import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/tgactor.db")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
SECRET_KEY = os.getenv("SECRET_KEY", os.getenv("ENCRYPTION_KEY", "tgactor-secret-key-replace-in-production"))
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", SECRET_KEY)
JWT_SECRET = os.getenv("JWT_SECRET", "jwt-secret-key")

ENABLE_CHANNEL_MONITOR = os.getenv("ENABLE_CHANNEL_MONITOR", "true").lower() == "true"
ENABLE_INBOX_LISTENER = os.getenv("ENABLE_INBOX_LISTENER", "true").lower() == "true"
