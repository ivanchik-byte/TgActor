import json
import random
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Scenario, ScenarioStep, MonitoredChannel

logger = logging.getLogger(__name__)

async def pick_random_scenario(session: AsyncSession, channel: MonitoredChannel) -> Scenario | None:
    history = []
    if channel.history_json:
        try:
            history = json.loads(channel.history_json)
        except Exception:
            history = []

    # Select only active scenarios that have at least 1 step
    stmt = (
        select(Scenario)
        .join(ScenarioStep, ScenarioStep.scenario_id == Scenario.id)
        .where(Scenario.is_active == True)
        .group_by(Scenario.id)
    )
    result = await session.execute(stmt)
    scenarios = list(result.scalars().all())

    if not scenarios:
        return None

    no_repeat = bool(channel.no_repeat_scenarios)

    # Filter out scenarios in recent history
    if no_repeat and len(scenarios) > 1:
        candidates = [s for s in scenarios if s.id not in history]
    else:
        candidates = list(scenarios)

    # If all valid scenarios have been played, reset history to reuse candidates
    if not candidates:
        candidates = list(scenarios)
        history = []

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
