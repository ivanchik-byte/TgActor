import json
import random
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Scenario, MonitoredChannel

logger = logging.getLogger(__name__)

async def pick_random_scenario(session: AsyncSession, channel: MonitoredChannel) -> Scenario | None:
    history = []
    if channel.history_json:
        try:
            history = json.loads(channel.history_json)
        except Exception:
            history = []

    stmt = select(Scenario).where(Scenario.is_active == True)
    result = await session.execute(stmt)
    scenarios = result.scalars().all()

    if not scenarios:
        return None

    no_repeat = bool(channel.no_repeat_scenarios)
    if not scenarios:
        return None

    if no_repeat and len(scenarios) > 1:
        candidates = [s for s in scenarios if s.id not in history]
    else:
        candidates = list(scenarios)

    if not candidates:
        candidates = list(scenarios)

    total_weight = sum(max(1, getattr(s, 'weight', 1)) for s in candidates)
    weights = [max(1, getattr(s, 'weight', 1)) / total_weight for s in candidates]

    chosen = random.choices(candidates, weights=weights, k=1)[0]

    if no_repeat:
        history.append(chosen.id)
        if len(history) > 5:
            history = history[-5:]
        channel.history_json = json.dumps(history)

    await session.commit()
    return chosen
