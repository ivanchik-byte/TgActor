import os

import pytest

os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("SECRET_KEY", "test-secret-key-1234567890abcdef")
# Bind the global app engine to a test database BEFORE any app module is
# imported. Without this, the first-imported test module freezes the global
# engine on the dev DB (./data/tgactor.db) and later os.environ overrides
# in test modules have no effect, which could wipe real data.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_api.db")


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _reset_auth_throttle():
    try:
        from app.api import auth as _auth

        _auth._attempts.clear()
    except Exception:
        pass
    yield
    try:
        from app.api import auth as _auth

        _auth._attempts.clear()
    except Exception:
        pass
