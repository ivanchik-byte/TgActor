from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any

from app.core.database import async_session
from app.models.models import SystemConfig, AiPreset
from app.models.schemas import AISettingsSchema, AiPresetCreate, AiPresetResponse
from app.services.ai_service import get_ai_settings, call_ai_completion, DEFAULT_SYSTEM_PROMPT

router = APIRouter()

@router.get("/api/settings/ai", response_model=AISettingsSchema)
async def get_ai_config():
    async with async_session() as session:
        settings = await get_ai_settings(session)
        # Mask API key for security when returning to UI
        key = settings.get("api_key")
        masked_key = f"{key[:4]}...{key[-4:]}" if key and len(key) > 8 else (key or "")
        return AISettingsSchema(
            ai_provider=settings["provider"],
            ai_api_key=masked_key,
            ai_default_model=settings["default_model"],
            ai_system_prompt=settings["system_prompt"],
            ai_base_url=settings.get("base_url")
        )

@router.post("/api/settings/ai")
async def save_ai_config(cfg: AISettingsSchema):
    async with async_session() as session:
        prompt_to_save = cfg.ai_system_prompt
        if not prompt_to_save or "Ты ведешь естественный человеческий диалог" in prompt_to_save:
            prompt_to_save = DEFAULT_SYSTEM_PROMPT

        updates = {
            "ai_provider": cfg.ai_provider,
            "ai_default_model": cfg.ai_default_model,
            "ai_system_prompt": prompt_to_save,
            "ai_base_url": cfg.ai_base_url.strip() if cfg.ai_base_url else ""
        }
        # Only update API key if user didn't leave it masked or empty
        if cfg.ai_api_key and not cfg.ai_api_key.startswith("***") and "..." not in cfg.ai_api_key:
            updates["ai_api_key"] = cfg.ai_api_key.strip()

        for key, val in updates.items():
            stmt = select(SystemConfig).where(SystemConfig.key == key)
            existing = (await session.execute(stmt)).scalars().first()
            if existing:
                existing.value = str(val)
            else:
                session.add(SystemConfig(key=key, value=str(val)))

        await session.commit()
        return {"status": "ok", "message": "AI settings saved successfully"}

@router.post("/api/settings/ai/test")
async def test_ai_connection(cfg: AISettingsSchema):
    """Test AI API key connection by sending a tiny test prompt."""
    async with async_session() as session:
        stored = await get_ai_settings(session)
        api_key = cfg.ai_api_key
        if not api_key or "..." in api_key:
            api_key = stored.get("api_key")

        if not api_key:
            raise HTTPException(400, detail="API Ключ не указан. Пожалуйста, введите ключ.")

        base_url = cfg.ai_base_url if cfg.ai_base_url is not None else stored.get("base_url")

        try:
            response_text = await call_ai_completion(
                provider=cfg.ai_provider,
                api_key=api_key,
                model=cfg.ai_default_model,
                system_prompt="Ответь одним словом 'OK'.",
                user_prompt="Проверка связи.",
                base_url=base_url
            )
            return {"status": "ok", "response": response_text.strip()}
        except Exception as e:
            raise HTTPException(400, detail=str(e))

@router.get("/api/settings/ai/presets")
async def list_ai_presets():
    async with async_session() as session:
        result = await session.execute(select(AiPreset).order_by(AiPreset.created_at.desc()))
        presets = result.scalars().all()
        return [
            {
                "id": p.id,
                "name": p.name,
                "model": p.model,
                "base_url": p.base_url,
                "has_key": bool(p.api_key),
                "created_at": p.created_at.isoformat() if p.created_at else None
            }
            for p in presets
        ]

@router.post("/api/settings/ai/presets")
async def create_ai_preset(preset: AiPresetCreate):
    if not preset.name or not preset.name.strip():
        raise HTTPException(400, detail="Название пресета не может быть пустым.")
    async with async_session() as session:
        existing = await session.execute(
            select(AiPreset).where(AiPreset.name == preset.name.strip())
        )
        if existing.scalars().first():
            raise HTTPException(400, detail=f"Пресет '{preset.name}' уже существует.")
        new_preset = AiPreset(
            name=preset.name.strip(),
            api_key=preset.api_key.strip() if preset.api_key else None,
            model=preset.model.strip() if preset.model else None,
            base_url=preset.base_url.strip() if preset.base_url else None,
            system_prompt=preset.system_prompt if preset.system_prompt else None
        )
        session.add(new_preset)
        await session.commit()
        return {"status": "ok", "id": new_preset.id, "name": new_preset.name}

@router.delete("/api/settings/ai/presets/{preset_id}")
async def delete_ai_preset(preset_id: int):
    async with async_session() as session:
        result = await session.execute(select(AiPreset).where(AiPreset.id == preset_id))
        preset = result.scalars().first()
        if not preset:
            raise HTTPException(404, detail="Пресет не найден.")
        await session.delete(preset)
        await session.commit()
        return {"status": "ok"}

@router.get("/api/settings/ai/presets/{preset_id}")
async def get_ai_preset(preset_id: int):
    """Load full preset data including API key for applying."""
    async with async_session() as session:
        result = await session.execute(select(AiPreset).where(AiPreset.id == preset_id))
        preset = result.scalars().first()
        if not preset:
            raise HTTPException(404, detail="Пресет не найден.")
        return {
            "id": preset.id,
            "name": preset.name,
            "api_key": preset.api_key or "",
            "model": preset.model or "",
            "base_url": preset.base_url or "",
            "system_prompt": preset.system_prompt or ""
        }
