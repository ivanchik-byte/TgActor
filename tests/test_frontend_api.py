import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["ADMIN_PASSWORD"] = "testpassword"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_api.db"
os.makedirs("./data", exist_ok=True)

import app.workers.channel_monitor as cm
import app.workers.inbox_listener as il

@pytest.fixture(autouse=True)
def mock_inbox_listeners(monkeypatch):
    async def dummy(*args, **kwargs): pass
    monkeypatch.setattr(cm, "start_channel_monitor", dummy)
    monkeypatch.setattr(cm, "stop_channel_monitor", dummy)
    monkeypatch.setattr(il, "start_inbox_listeners", dummy)
    monkeypatch.setattr(il, "stop_inbox_listeners", dummy)

from main import app
import app.core.config as config
config.ADMIN_PASSWORD = "testpassword"

from app.core.database import engine
from app.models.models import Base

@pytest_asyncio.fixture(autouse=True)
async def init_db_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_token_headers(ac):
    resp = await ac.post("/api/auth/login", json={"password": "testpassword"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

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
        headers = await get_token_headers(ac)
        resp = await ac.post("/api/config/proxy-mode", json={"use_proxy": True}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["use_proxy"] == True
        
        resp = await ac.get("/api/config/proxy-mode", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["use_proxy"] == True

@pytest.mark.asyncio
async def test_scenarios():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        headers = await get_token_headers(ac)
        resp = await ac.post("/api/scenarios", json={"title": "Test Scenario", "is_active": True, "min_delay": 1, "max_delay": 2}, headers=headers)
        assert resp.status_code == 200
        sc_id = resp.json()["id"]
        
        resp = await ac.get("/api/scenarios", headers=headers)
        assert resp.status_code == 200
        scenarios = resp.json()
        assert any(s["id"] == sc_id for s in scenarios)

@pytest.mark.asyncio
async def test_accounts():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        headers = await get_token_headers(ac)
        resp = await ac.get("/api/accounts", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

@pytest.mark.asyncio
async def test_channels_api():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        headers = await get_token_headers(ac)
        
        # Test creating channel with URL
        resp = await ac.post("/api/channels", json={
            "channel_identifier": "https://t.me/testchannel228",
            "min_delay_seconds": 5,
            "max_delay_seconds": 15,
            "no_repeat_scenarios": True
        }, headers=headers)
        assert resp.status_code == 200
        assert "added_ids" in resp.json()
        assert len(resp.json()["added_ids"]) == 1
        ch_id = resp.json()["added_ids"][0]

        # Test listing channels
        resp = await ac.get("/api/channels", headers=headers)
        assert resp.status_code == 200
        channels = resp.json()
        assert any(c["channel_username"] == "testchannel228" for c in channels)

        # Test patching channel
        resp = await ac.patch(f"/api/channels/{ch_id}", json={
            "is_active": False,
            "min_delay_seconds": 8,
            "max_delay_seconds": 20,
            "no_repeat_scenarios": False
        }, headers=headers)
        assert resp.status_code == 200

        # Test monitor status
        resp = await ac.get("/api/channels/monitor/status", headers=headers)
        assert resp.status_code == 200
        assert "running" in resp.json()

        # Test deleting channel
        resp = await ac.delete(f"/api/channels/{ch_id}", headers=headers)
        assert resp.status_code == 200

