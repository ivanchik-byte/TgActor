import re
import asyncio
import logging
from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import async_session
from app.models.models import Scenario, ScenarioStep
from app.models.schemas import ScenarioCreate, ScenarioUpdate, ScenarioResponse, AIScenarioGenerateRequest
from app.services.scenario_service import execute_scenario
from app.services.ai_service import generate_scenario_from_prompt

logger = logging.getLogger("tgactor.scenarios")
router = APIRouter()

# Keep strong references so GC cannot reap running scenario tasks
_running_executions: set = set()

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
    is_ai_dynamic: Optional[bool] = False
    ai_prompt: Optional[str] = None

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
async def update_scenario(scenario_id: int, sc: ScenarioUpdate):
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, "Scenario not found")
        updated = sc.model_dump(exclude_unset=True)
        for field in ("title", "is_active", "min_delay", "max_delay", "weight",
                      "mode", "ai_prompt", "ai_provider", "ai_model", "system_instruction"):
            if field in updated:
                setattr(scenario, field, updated[field])
        await session.commit()
        return {"status": "ok"}

@router.delete("/api/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: int):
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, "Scenario not found")
        # Clean up dependent rows first (FKs may lack ON DELETE on existing tables)
        from app.models.models import TaskLog, ActionLog
        await session.execute(delete(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id))
        await session.execute(delete(TaskLog).where(TaskLog.scenario_id == scenario_id))
        await session.execute(delete(ActionLog).where(ActionLog.scenario_id == scenario_id))
        await session.delete(scenario)
        await session.commit()
        return {"status": "ok"}

@router.get("/api/scenarios/{scenario_id}/steps")
async def get_scenario_steps(scenario_id: int):
    async with async_session() as session:
        stmt = select(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id).order_by(ScenarioStep.step_order)
        result = await session.execute(stmt)
        return result.scalars().all()

class AIPromptGenerateRequest(BaseModel):
    topic: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None

@router.post("/api/scenarios/generate-prompt")
async def generate_scenario_prompt_endpoint(req: AIPromptGenerateRequest):
    async with async_session() as session:
        try:
            from app.services.ai_service import generate_prompt_idea
            prompt_idea = await generate_prompt_idea(
                session=session,
                topic=req.topic,
                override_provider=req.provider,
                override_model=req.model
            )
            return {"status": "ok", "prompt": prompt_idea}
        except Exception as e:
            logger.error(f"AI Prompt Idea Generation failed: {e}", exc_info=True)
            raise HTTPException(400, detail=f"Не удалось сгенерировать тему: {str(e)}")

@router.post("/api/scenarios/generate-ai")
async def generate_scenario_ai_endpoint(req: AIScenarioGenerateRequest):
    async with async_session() as session:
        try:
            generated = await generate_scenario_from_prompt(
                session=session,
                prompt=req.prompt,
                accounts_count=req.accounts_count or 3,
                steps_count=req.steps_count,
                reactions_enabled=req.reactions_enabled if req.reactions_enabled is not None else True,
                is_dynamic=req.is_dynamic or False,
                override_provider=req.provider,
                override_model=req.model,
                override_system_prompt=req.system_prompt
            )
            return {"status": "ok", "scenario": generated}
        except Exception as e:
            logger.error(f"AI Scenario Generation failed: {e}", exc_info=True)
            raise HTTPException(400, detail=f"AI Scenario Generation failed: {str(e)}")

def _build_step(scenario_id: int, item: "ScenarioStepBulkItem") -> ScenarioStep:
    return ScenarioStep(
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
        reaction_roles=item.reaction_roles,
        is_ai_dynamic=item.is_ai_dynamic or False,
        ai_prompt=item.ai_prompt
    )


def _link_replies(db_steps: list, items: list) -> None:
    for idx, item in enumerate(items):
        if item.reply_to_index is not None and 0 <= item.reply_to_index < len(db_steps):
            db_steps[idx].reply_to_step_id = db_steps[item.reply_to_index].id


def _export_step(step, reply_idx):
    return {
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
        "reaction_roles": step.reaction_roles,
        "is_ai_dynamic": step.is_ai_dynamic,
        "ai_prompt": step.ai_prompt
    }

@router.post("/api/scenarios/{scenario_id}/steps/bulk")
async def save_scenario_steps_bulk(scenario_id: int, req: ScenarioStepsBulkRequest):
    async with async_session() as session:
        await session.execute(delete(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id))
        db_steps = [_build_step(scenario_id, item) for item in req.steps]
        for step in db_steps:
            session.add(step)
        await session.flush()
        _link_replies(db_steps, req.steps)
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
            exported_steps.append(_export_step(step, reply_idx))
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
        db_steps = [_build_step(scenario.id, item) for item in data.steps]
        for step in db_steps:
            session.add(step)
        await session.flush()
        _link_replies(db_steps, data.steps)
        await session.commit()
        return {"status": "ok", "id": scenario.id, "steps_count": len(db_steps)}

def _parse_target(target: str, post_id: Optional[int]):
    raw = target.strip()
    if raw.startswith("https://t.me/+") or raw.startswith("t.me/+"):
        return raw.split("t.me/")[-1], post_id
    if "t.me/c/" in raw:
        match = re.search(r"t\.me/c/(\d+)/(\d+)?", raw)
        if match:
            chat_id = f"-100{match.group(1)}"
            pid = int(match.group(2)) if match.group(2) and not post_id else post_id
            return chat_id, pid
    if "t.me/" in raw:
        match = re.search(r"t\.me/([^/]+)/?(\d+)?", raw)
        if match:
            channel_part = match.group(1)
            parsed_post_id = match.group(2)
            if channel_part not in ("c",):
                raw = f"@{channel_part}" if not channel_part.startswith("@") else channel_part
            if parsed_post_id and not post_id:
                post_id = int(parsed_post_id)
            return raw, post_id
    if not raw.startswith("@") and not raw.startswith("-") and not raw.lstrip('-').isdigit():
        raw = f"@{raw}"
    return raw, post_id

@router.post("/api/scenarios/{scenario_id}/execute")
async def run_scenario_endpoint(scenario_id: int, req: ScenarioExecuteRequest):
    target, post_id = _parse_target(req.target, req.post_id)
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, detail="Сценарий не найден.")
    for running in list(_running_executions):
        if getattr(running, "_tgactor_key", None) == (scenario_id, target, post_id):
            return {"status": "already_running", "target": target, "post_id": post_id}
    async def _runner():
        async with async_session() as s:
            try:
                await execute_scenario(s, scenario_id, target, post_id)
            except Exception as e:
                logger.error(f"Scenario #{scenario_id} execution failed: {e}", exc_info=True)
    task = asyncio.create_task(_runner())
    task._tgactor_key = (scenario_id, target, post_id)
    _running_executions.add(task)
    task.add_done_callback(_running_executions.discard)
    return {"status": "started", "target": target, "post_id": post_id}
