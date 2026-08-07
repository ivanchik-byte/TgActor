import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/tgactor.db")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
SECRET_KEY = os.getenv("SECRET_KEY", "tgactor-secret-key-replace-in-production")
JWT_SECRET = os.getenv("JWT_SECRET", "jwt-secret-key")
