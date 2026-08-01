import pytest
import asyncio
from inbox_listener import engine

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(autouse=True)
async def cleanup_engine():
    yield
    await engine.dispose()
