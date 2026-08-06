import os
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

# Force ADMIN_PASSWORD for test
os.environ["ADMIN_PASSWORD"] = "testpassword"

import inbox_ws
import pytest

@pytest.fixture(autouse=True)
def mock_inbox_listeners(monkeypatch):
    async def dummy(*args, **kwargs): pass
    monkeypatch.setattr(inbox_ws, "start_listeners", dummy)
    monkeypatch.setattr(inbox_ws, "stop_listeners", dummy)

from main import app

@pytest.mark.asyncio
async def test_auth_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/auth/login", json={"password": "wrong"})
        assert resp.status_code == 401
        
        resp = await ac.post("/api/auth/login", json={"password": "testpassword"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

@pytest.mark.asyncio
async def test_proxy_mode():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/config/proxy-mode", json={"use_proxy": True})
        assert resp.status_code == 200
        assert resp.json()["use_proxy"] == True
        
        resp = await ac.get("/api/config/proxy-mode")
        assert resp.status_code == 200
        assert resp.json()["use_proxy"] == True

@pytest.mark.asyncio
async def test_scenarios():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/scenarios", json={"title": "Test Scenario", "is_active": True, "min_delay": 1, "max_delay": 2})
        assert resp.status_code == 200
        sc_id = resp.json()["id"]
        
        resp = await ac.get("/api/scenarios")
        assert resp.status_code == 200
        scenarios = resp.json()
        assert any(s["id"] == sc_id for s in scenarios)

@pytest.mark.asyncio
async def test_accounts():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/api/accounts")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
