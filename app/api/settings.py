from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any

from app.core.database import async_session
from app.models.models import SystemConfig
from app.models.schemas import AISettingsSchema
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
            raise HTTPException(400, detail="API Key is missing")

        try:
            response_text = await call_ai_completion(
                provider=cfg.ai_provider,
                api_key=api_key,
                model=cfg.ai_default_model,
                system_prompt="Ответь одним словом 'OK'.",
                user_prompt="Проверка связи.",
                base_url=cfg.ai_base_url or stored.get("base_url")
            )
            return {"status": "ok", "response": response_text.strip()}
        except Exception as e:
            raise HTTPException(400, detail=f"AI Connection Test failed: {str(e)}")
