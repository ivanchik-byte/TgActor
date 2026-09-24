import json
import logging

logger = logging.getLogger(__name__)


async def publish_inbox_event(event: dict) -> None:
    from app.core.database import redis_client
    try:
        await redis_client.publish("inbox_events", json.dumps(event))
    except Exception as e:
        logger.warning(f"Redis publish inbox event failed: {e}")
