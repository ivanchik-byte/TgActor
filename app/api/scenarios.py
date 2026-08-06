import re
import asyncio
from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import async_session
from app.models.models import Scenario, ScenarioStep
from app.models.schemas import ScenarioCreate, ScenarioUpdate, ScenarioResponse
from app.services.scenario_service import execute_scenario

router = APIRouter()

class ScenarioExecuteRequest(BaseModel):
    target: str
    post_id: Optional[int] = None

class ScenarioStepBulkItem(BaseModel):
    step_order: int
    role_id: int
    message_type: str
    text: Optional[str] = None
    media_path: Optional[str] = None
    delay_before_min: Optional[float] = None
    delay_before_max: Optional[float] = None
    reactions: Optional[str] = None
    reaction_count: Optional[int] = None
    reply_to_index: Optional[int] = None
    reaction_source: Optional[str] = 'pool'
    reaction_roles: Optional[str] = None

class ScenarioStepsBulkRequest(BaseModel):
    steps: List[ScenarioStepBulkItem]

class ScenarioImportRequest(BaseModel):
    title: str
    min_delay: float = 5.0
    max_delay: float = 10.0
    weight: int = 1
    is_active: bool = True
    steps: List[ScenarioStepBulkItem]

@router.get("/api/scenarios")
async def get_scenarios():
    async with async_session() as session:
        result = await session.execute(select(Scenario).order_by(Scenario.id.asc()))
        return result.scalars().all()

@router.post("/api/scenarios")
async def create_scenario(sc: ScenarioCreate):
    async with async_session() as session:
        scenario = Scenario(**sc.model_dump())
        session.add(scenario)
        await session.commit()
        return {"status": "ok", "id": scenario.id}

@router.put("/api/scenarios/{scenario_id}")
async def update_scenario(scenario_id: int, sc: ScenarioCreate):
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, "Scenario not found")
        scenario.title = sc.title
        scenario.is_active = sc.is_active
        scenario.min_delay = sc.min_delay
        scenario.max_delay = sc.max_delay
        scenario.weight = sc.weight
        await session.commit()
        return {"status": "ok"}

@router.delete("/api/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: int):
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, "Scenario not found")
        await session.execute(delete(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id))
        await session.delete(scenario)
        await session.commit()
        return {"status": "ok"}

@router.get("/api/scenarios/{scenario_id}/steps")
async def get_scenario_steps(scenario_id: int):
    async with async_session() as session:
        stmt = select(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id).order_by(ScenarioStep.step_order)
        result = await session.execute(stmt)
        return result.scalars().all()

@router.post("/api/scenarios/{scenario_id}/steps/bulk")
async def save_scenario_steps_bulk(scenario_id: int, req: ScenarioStepsBulkRequest):
    async with async_session() as session:
        await session.execute(delete(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id))
        db_steps = []
        for item in req.steps:
            db_step = ScenarioStep(
                scenario_id=scenario_id,
                step_order=item.step_order,
                role_id=item.role_id,
                message_type=item.message_type,
                text=item.text,
                media_path=item.media_path,
                delay_before_min=item.delay_before_min,
                delay_before_max=item.delay_before_max,
                reactions=item.reactions,
                reaction_count=item.reaction_count,
                reaction_source=item.reaction_source or 'pool',
                reaction_roles=item.reaction_roles
            )
            session.add(db_step)
            db_steps.append(db_step)
        await session.flush()
        for idx, item in enumerate(req.steps):
            if item.reply_to_index is not None and 0 <= item.reply_to_index < len(db_steps):
                db_steps[idx].reply_to_step_id = db_steps[item.reply_to_index].id
        await session.commit()
        return {"status": "ok", "count": len(db_steps)}

@router.get("/api/scenarios/{scenario_id}/export")
async def export_scenario(scenario_id: int):
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, "Scenario not found")
        steps_stmt = select(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id).order_by(ScenarioStep.step_order)
        steps = list((await session.execute(steps_stmt)).scalars().all())
        step_id_to_index = {step.id: idx for idx, step in enumerate(steps)}
        exported_steps = []
        for step in steps:
            reply_idx = step_id_to_index.get(step.reply_to_step_id) if step.reply_to_step_id else None
            exported_steps.append({
                "step_order": step.step_order,
                "role_id": step.role_id,
                "message_type": step.message_type,
                "text": step.text,
                "media_path": step.media_path,
                "delay_before_min": step.delay_before_min,
                "delay_before_max": step.delay_before_max,
                "reactions": step.reactions,
                "reaction_count": step.reaction_count,
                "reply_to_index": reply_idx,
                "reaction_source": step.reaction_source,
                "reaction_roles": step.reaction_roles
            })
        return {
            "version": 1,
            "title": scenario.title,
            "min_delay": scenario.min_delay,
            "max_delay": scenario.max_delay,
            "weight": scenario.weight,
            "is_active": scenario.is_active,
            "steps": exported_steps
        }

@router.post("/api/scenarios/import")
async def import_scenario(data: ScenarioImportRequest):
    async with async_session() as session:
        scenario = Scenario(
            title=data.title,
            min_delay=data.min_delay,
            max_delay=data.max_delay,
            weight=data.weight,
            is_active=data.is_active
        )
        session.add(scenario)
        await session.flush()
        db_steps = []
        for item in data.steps:
            db_step = ScenarioStep(
                scenario_id=scenario.id,
                step_order=item.step_order,
                role_id=item.role_id,
                message_type=item.message_type,
                text=item.text,
                media_path=item.media_path,
                delay_before_min=item.delay_before_min,
                delay_before_max=item.delay_before_max,
                reactions=item.reactions,
                reaction_count=item.reaction_count,
                reaction_source=item.reaction_source or 'pool',
                reaction_roles=item.reaction_roles
            )
            session.add(db_step)
            db_steps.append(db_step)
        await session.flush()
        for idx, item in enumerate(data.steps):
            if item.reply_to_index is not None and 0 <= item.reply_to_index < len(db_steps):
                db_steps[idx].reply_to_step_id = db_steps[item.reply_to_index].id
        await session.commit()
        return {"status": "ok", "id": scenario.id, "steps_count": len(db_steps)}

@router.post("/api/scenarios/{scenario_id}/execute")
async def run_scenario_endpoint(scenario_id: int, req: ScenarioExecuteRequest):
    target = req.target.strip()
    post_id = req.post_id
    if "t.me/" in target:
        match = re.search(r"t\.me/([^/]+)/?(\d+)?", target)
        if match:
            channel_part = match.group(1)
            parsed_post_id = match.group(2)
            if channel_part != "c":
                target = f"@{channel_part}" if not channel_part.startswith("@") else channel_part
            if parsed_post_id and not post_id:
                post_id = int(parsed_post_id)
    if not target.startswith("@") and not target.startswith("-") and not target.lstrip('-').isdigit():
        target = f"@{target}"
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, detail="Сценарий не найден.")
    async def _runner():
        async with async_session() as s:
            await execute_scenario(s, scenario_id, target, post_id)
    asyncio.create_task(_runner())
    return {"status": "started", "target": target, "post_id": post_id}
