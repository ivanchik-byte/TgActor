import json
import logging
import re
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, delete

from app.core.database import async_session
from app.models.models import PromptTemplate, Scenario, ScenarioStep, Account, SystemConfig
from app.models.schemas import (
    PromptTemplateCreate,
    PromptTemplateUpdate,
    PromptTemplateResponse,
    CategoryItem,
    CategoryCreate,
    StudioGenerateRequest,
    StudioGenerateResponse,
    CreateScenarioFromStudioRequest
)
from app.services.ai_service import generate_studio_prompt, enhance_prompt_description
from pydantic import BaseModel

logger = logging.getLogger("tgactor.prompts")
router = APIRouter()

class EnhancePromptRequest(BaseModel):
    text: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None

DEFAULT_CATEGORIES = [
    {"id": "software", "label": "Софт / IT", "color": "#38bdf8", "is_builtin": True},
    {"id": "crypto", "label": "Крипта & TON", "color": "#fbbf24", "is_builtin": True},
    {"id": "warmup", "label": "Прогрев & Кейсы", "color": "#4ade80", "is_builtin": True},
    {"id": "skepticism", "label": "Скепсис & Пруфы", "color": "#a78bfa", "is_builtin": True},
    {"id": "services", "label": "Услуги & Товары", "color": "#f87171", "is_builtin": True},
    {"id": "general", "label": "Общие темы", "color": "#94a3b8", "is_builtin": True}
]

async def _get_all_categories(session: AsyncSession) -> List[Dict[str, Any]]:
    """Retrieve combined list of built-in and custom user categories."""
    stmt = select(SystemConfig).where(SystemConfig.key == "prompt_custom_categories")
    res = (await session.execute(stmt)).scalars().first()
    custom_cats = []
    if res and res.value:
        try:
            custom_cats = json.loads(res.value)
        except Exception:
            custom_cats = []
    
    # Merge default and custom
    all_cats = list(DEFAULT_CATEGORIES)
    for c in custom_cats:
        if not any(d["id"] == c.get("id") for d in all_cats):
            all_cats.append({
                "id": c.get("id"),
                "label": c.get("label"),
                "color": c.get("color") or "#38bdf8",
                "is_builtin": False
            })
    return all_cats

def _parse_categories(raw_cat: Optional[str]) -> List[str]:
    """Parse comma-separated or single category string into a list of cleaned category IDs."""
    if not raw_cat:
        return ["general"]
    parts = [p.strip() for p in raw_cat.split(",") if p.strip()]
    return parts if parts else ["general"]

@router.get("/api/prompts/categories")
async def list_prompt_categories():
    """Get all available prompt categories (built-in + custom user categories)."""
    async with async_session() as session:
        return await _get_all_categories(session)

@router.post("/api/prompts/categories")
async def create_prompt_category(req: CategoryCreate):
    """Add a new custom prompt category."""
    if not req.label or not req.label.strip():
        raise HTTPException(400, "Название категории не может быть пустым.")

    label = req.label.strip()
    # Generate slug ID from label
    cat_id = re.sub(r'[^a-zA-Z0-9а-яА-ЯёЁ_]+', '_', label.lower()).strip('_')
    if not cat_id:
        cat_id = f"cat_{int(datetime.utcnow().timestamp())}"

    async with async_session() as session:
        categories = await _get_all_categories(session)
        if any(c["id"] == cat_id or c["label"].lower() == label.lower() for c in categories):
            raise HTTPException(400, f"Категория '{label}' уже существует.")

        stmt = select(SystemConfig).where(SystemConfig.key == "prompt_custom_categories")
        res = (await session.execute(stmt)).scalars().first()
        custom_list = []
        if res and res.value:
            try:
                custom_list = json.loads(res.value)
            except Exception:
                custom_list = []

        new_cat = {
            "id": cat_id,
            "label": label,
            "color": req.color or "#38bdf8",
            "is_builtin": False
        }
        custom_list.append(new_cat)

        if res:
            res.value = json.dumps(custom_list, ensure_ascii=False)
        else:
            session.add(SystemConfig(key="prompt_custom_categories", value=json.dumps(custom_list, ensure_ascii=False)))

        await session.commit()
        return {"status": "ok", "category": new_cat}

@router.delete("/api/prompts/categories/{cat_id}")
async def delete_prompt_category(cat_id: str):
    """Delete custom prompt category."""
    if any(d["id"] == cat_id for d in DEFAULT_CATEGORIES):
        raise HTTPException(400, "Нельзя удалить системную категорию.")

    async with async_session() as session:
        stmt = select(SystemConfig).where(SystemConfig.key == "prompt_custom_categories")
        res = (await session.execute(stmt)).scalars().first()
        if not res or not res.value:
            raise HTTPException(404, "Категория не найдена.")

        try:
            custom_list = json.loads(res.value)
            new_list = [c for c in custom_list if c.get("id") != cat_id]
            res.value = json.dumps(new_list, ensure_ascii=False)
            await session.commit()
            return {"status": "ok"}
        except Exception as e:
            raise HTTPException(400, detail=str(e))

@router.get("/api/prompts")
async def list_prompt_templates(
    search: Optional[str] = None,
    category: Optional[str] = None,
    mode: Optional[str] = None
):
    """Retrieve list of prompt templates with multi-category support and search filters."""
    async with async_session() as session:
        query = select(PromptTemplate).order_by(PromptTemplate.is_builtin.desc(), PromptTemplate.created_at.desc())

        if category and category != "all":
            # Multi-category substring match
            query = query.where(
                or_(
                    PromptTemplate.category == category,
                    PromptTemplate.category.ilike(f"%{category}%")
                )
            )

        if mode and mode != "all":
            query = query.where(PromptTemplate.mode == mode)

        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            query = query.where(
                or_(
                    PromptTemplate.title.ilike(term),
                    PromptTemplate.prompt_text.ilike(term),
                    PromptTemplate.tags.ilike(term),
                    PromptTemplate.description.ilike(term)
                )
            )

        result = await session.execute(query)
        templates = result.scalars().all()
        return [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "category": t.category,
                "categories": _parse_categories(t.category),
                "mode": t.mode,
                "prompt_text": t.prompt_text,
                "system_instruction": t.system_instruction,
                "roles_breakdown": t.roles_breakdown,
                "steps_payload": t.steps_payload,
                "tags": t.tags,
                "is_builtin": t.is_builtin,
                "created_at": t.created_at.isoformat() if t.created_at else None
            }
            for t in templates
        ]

@router.post("/api/prompts")
async def create_prompt_template(req: PromptTemplateCreate):
    """Create a new custom prompt template in the library with multiple categories and steps support."""
    if not req.title or not req.title.strip():
        raise HTTPException(400, "Название шаблона не может быть пустым.")
    if not req.prompt_text or not req.prompt_text.strip():
        raise HTTPException(400, "Текст промпта не может быть пустым.")

    # Resolve categories
    if req.categories and len(req.categories) > 0:
        cat_str = ",".join(dict.fromkeys([c.strip() for c in req.categories if c.strip()]))
    elif req.category:
        cat_str = req.category.strip()
    else:
        cat_str = "general"

    async with async_session() as session:
        template = PromptTemplate(
            title=req.title.strip(),
            description=req.description.strip() if req.description else None,
            category=cat_str,
            mode=req.mode or "dynamic",
            prompt_text=req.prompt_text.strip(),
            system_instruction=req.system_instruction if req.system_instruction else None,
            roles_breakdown=req.roles_breakdown if req.roles_breakdown else None,
            steps_payload=req.steps_payload if req.steps_payload else None,
            tags=req.tags.strip() if req.tags else None,
            is_builtin=False
        )
        session.add(template)
        await session.commit()
        return {
            "status": "ok",
            "id": template.id,
            "title": template.title,
            "categories": _parse_categories(template.category)
        }

@router.get("/api/prompts/{template_id}")
async def get_prompt_template(template_id: int):
    """Get single prompt template details."""
    async with async_session() as session:
        template = await session.get(PromptTemplate, template_id)
        if not template:
            raise HTTPException(404, "Шаблон промпта не найден.")
        return {
            "id": template.id,
            "title": template.title,
            "description": template.description,
            "category": template.category,
            "categories": _parse_categories(template.category),
            "mode": template.mode,
            "prompt_text": template.prompt_text,
            "system_instruction": template.system_instruction,
            "roles_breakdown": template.roles_breakdown,
            "steps_payload": template.steps_payload,
            "tags": template.tags,
            "is_builtin": template.is_builtin,
            "created_at": template.created_at.isoformat() if template.created_at else None
        }

@router.put("/api/prompts/{template_id}")
async def update_prompt_template(template_id: int, req: PromptTemplateUpdate):
    """Update prompt template with multiple categories and steps."""
    async with async_session() as session:
        template = await session.get(PromptTemplate, template_id)
        if not template:
            raise HTTPException(404, "Шаблон промпта не найден.")

        if req.title is not None:
            template.title = req.title.strip()
        if req.description is not None:
            template.description = req.description.strip() if req.description else None
        
        if req.categories is not None:
            template.category = ",".join(dict.fromkeys([c.strip() for c in req.categories if c.strip()]))
        elif req.category is not None:
            template.category = req.category.strip()

        if req.mode is not None:
            template.mode = req.mode
        if req.prompt_text is not None:
            template.prompt_text = req.prompt_text.strip()
        if req.system_instruction is not None:
            template.system_instruction = req.system_instruction
        if req.roles_breakdown is not None:
            template.roles_breakdown = req.roles_breakdown
        if req.steps_payload is not None:
            template.steps_payload = req.steps_payload
        if req.tags is not None:
            template.tags = req.tags.strip() if req.tags else None

        await session.commit()
        return {
            "status": "ok",
            "id": template.id,
            "categories": _parse_categories(template.category)
        }

@router.delete("/api/prompts/{template_id}")
async def delete_prompt_template(template_id: int):
    """Delete custom prompt template."""
    async with async_session() as session:
        template = await session.get(PromptTemplate, template_id)
        if not template:
            raise HTTPException(404, "Шаблон не найден.")
        await session.delete(template)
        await session.commit()
        return {"status": "ok"}

@router.post("/api/prompts/generate-studio")
async def generate_studio_prompt_endpoint(req: StudioGenerateRequest):
    """AI Studio generation endpoint: generates comprehensive scenario prompt and role breakdown."""
    async with async_session() as session:
        try:
            result = await generate_studio_prompt(
                session=session,
                topic=req.topic,
                mode=req.mode,
                drama_type=req.drama_type,
                tone=req.tone,
                roles_count=req.roles_count,
                steps_count=req.steps_count,
                override_provider=req.provider,
                override_model=req.model,
                override_system_prompt=req.system_prompt
            )
            return {"status": "ok", "data": result}
        except Exception as e:
            logger.error(f"Studio generation failed: {e}", exc_info=True)
            raise HTTPException(400, detail=str(e))

@router.post("/api/prompts/create-scenario")
async def create_scenario_from_studio(req: CreateScenarioFromStudioRequest):
    """Create and configure a live scenario from Prompt Studio in 1 click."""
    async with async_session() as session:
        # Resolve active commenting accounts to assign valid role IDs
        acc_stmt = select(Account.id).where(Account.is_active == True)
        active_ids = list((await session.execute(acc_stmt)).scalars().all())
        if not active_ids:
            active_ids = [1, 2, 3]

        scenario = Scenario(
            title=req.title.strip(),
            is_active=True,
            min_delay=req.min_delay,
            max_delay=req.max_delay,
            weight=req.weight,
            mode="ai_dynamic" if req.mode == "dynamic" else "ai_static",
            ai_prompt=req.prompt_text
        )
        session.add(scenario)
        await session.flush()

        # Add steps
        created_steps = []
        for idx, step_data in enumerate(req.steps):
            role_id = active_ids[idx % len(active_ids)]
            is_dynamic = bool(step_data.get("is_ai_dynamic") or req.mode == "dynamic")
            
            # For dynamic mode: ai_prompt is the prompt instruction, text is sample preview
            # For static mode: text is the exact message text, ai_prompt is None
            if is_dynamic:
                ai_prompt_val = step_data.get("ai_prompt") or step_data.get("text") or ""
                text_val = step_data.get("sample_text") or step_data.get("text") or ai_prompt_val
            else:
                ai_prompt_val = None
                text_val = step_data.get("text") or f"Шаг {idx+1}"

            reply_target = step_data.get("reply_to_step")
            is_reply = reply_target is not None and idx > 0

            step = ScenarioStep(
                scenario_id=scenario.id,
                role_id=role_id,
                step_order=idx + 1,
                message_type="reply" if is_reply else "normal",
                text=text_val,
                ai_prompt=ai_prompt_val,
                is_ai_dynamic=is_dynamic,
                delay_before_min=float(step_data.get("delay_before_min") or 4.0),
                delay_before_max=float(step_data.get("delay_before_max") or 9.0),
                reactions=step_data.get("reactions"),
                reaction_count=int(step_data.get("reaction_count") or 0) if step_data.get("reactions") else 0,
                reaction_source="pool"
            )
            session.add(step)
            created_steps.append((step, reply_target))

        await session.flush()

        # Link reply_to_step_id
        for idx, (step_obj, reply_target) in enumerate(created_steps):
            if reply_target is not None and isinstance(reply_target, int) and 1 <= reply_target <= len(created_steps):
                target_step = created_steps[reply_target - 1][0]
                if target_step and target_step.id != step_obj.id:
                    step_obj.reply_to_step_id = target_step.id
            elif idx > 0 and step_obj.message_type == "reply":
                # Default reply to preceding step
                step_obj.reply_to_step_id = created_steps[idx - 1][0].id

        await session.commit()
        return {"status": "ok", "scenario_id": scenario.id, "title": scenario.title}

@router.post("/api/prompts/enhance-prompt")
async def enhance_prompt_endpoint(req: EnhancePromptRequest):
    """Refine, detail, and enhance user prompt idea using AI."""
    async with async_session() as session:
        try:
            enhanced = await enhance_prompt_description(
                session=session,
                text=req.text,
                override_provider=req.provider,
                override_model=req.model
            )
            return {"status": "ok", "enhanced_prompt": enhanced}
        except Exception as e:
            logger.error(f"AI Prompt Enhancement failed: {e}", exc_info=True)
            raise HTTPException(400, detail=str(e))

