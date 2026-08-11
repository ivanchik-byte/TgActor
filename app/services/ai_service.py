import json
import logging
from typing import Optional, Dict, Any, List
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import SystemConfig, Account

logger = logging.getLogger(__name__)

# Default model fallbacks per provider
DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "deepseek": "deepseek-chat",
    "openrouter": "openai/gpt-4o-mini",
    "gemini": "gemini-1.5-flash"
}

# API Endpoint base URLs per provider
PROVIDER_URLS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "deepseek": "https://api.deepseek.com/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions"
}

async def get_ai_settings(session: AsyncSession) -> Dict[str, Any]:
    """Retrieve saved AI credentials from system_config table."""
    keys = ["ai_provider", "ai_api_key", "ai_default_model", "ai_system_prompt"]
    result = {}
    for k in keys:
        stmt = select(SystemConfig).where(SystemConfig.key == k)
        res = (await session.execute(stmt)).scalars().first()
        result[k] = res.value if res else None
    
    provider = result.get("ai_provider") or "openai"
    model = result.get("ai_default_model") or DEFAULT_MODELS.get(provider, "gpt-4o-mini")
    system_prompt = result.get("ai_system_prompt") or "Ты ведешь естественный человеческий диалог в комментариях Telegram."
    
    return {
        "provider": provider,
        "api_key": result.get("ai_api_key"),
        "default_model": model,
        "system_prompt": system_prompt
    }

async def call_ai_completion(
    provider: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    json_mode: bool = False
) -> str:
    """Call AI API for OpenAI, DeepSeek, OpenRouter, or Gemini."""
    if not api_key:
        raise ValueError("AI API key is missing. Please configure your API key in Settings.")

    provider = (provider or "openai").lower()
    model = model or DEFAULT_MODELS.get(provider, "gpt-4o-mini")

    async with httpx.AsyncClient(timeout=45.0) as client:
        if provider == "gemini":
            # Gemini REST API format
            gemini_model = model if "gemini" in model else "gemini-1.5-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={api_key}"
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": f"System Instruction: {system_prompt}\n\nUser Prompt:\n{user_prompt}"}
                        ]
                    }
                ]
            }
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini API error ({resp.status_code}): {resp.text}")
            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise RuntimeError("Gemini API returned no completion candidates")
            parts = candidates[0].get("content", {}).get("parts", [])
            return parts[0].get("text", "") if parts else ""
        else:
            # OpenAI / DeepSeek / OpenRouter compatible format
            url = PROVIDER_URLS.get(provider, PROVIDER_URLS["openai"])
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            if provider == "openrouter":
                headers["HTTP-Referer"] = "https://tgactor.local"
                headers["X-Title"] = "TgActor"

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            payload: Dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": 0.7
            }
            if json_mode and provider in ["openai", "deepseek"]:
                payload["response_format"] = {"type": "json_object"}

            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"{provider.upper()} API error ({resp.status_code}): {resp.text}")
            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                raise RuntimeError(f"{provider.upper()} API returned no choices")
            return choices[0].get("message", {}).get("content", "")

async def generate_scenario_from_prompt(
    session: AsyncSession,
    prompt: str,
    accounts_count: int = 3,
    reactions_enabled: bool = True,
    override_provider: Optional[str] = None,
    override_model: Optional[str] = None
) -> Dict[str, Any]:
    """Generate full scenario steps structure (roles, texts, reactions, delays) from user prompt."""
    settings = await get_ai_settings(session)
    provider = override_provider or settings["provider"]
    api_key = settings["api_key"]
    model = override_model or settings["default_model"]

    # Get active account IDs to assign roles realistically
    acc_stmt = select(Account.id).where(Account.is_active == True)
    existing_accs = list((await session.execute(acc_stmt)).scalars().all())
    if not existing_accs:
        existing_accs = [1, 2, 3]

    system_prompt = (
        "Ты — генератор сценариев реального человеческого общения в комментарии Telegram. "
        "Создай структурированный диалог на русском языке в формате JSON. "
        "Диалог должен звучать 100% естественно, живой разговорный сленг, с репликами и эмодзи."
    )

    user_instructions = f"""
Создай сценарий общения по следующему описанию:
"{prompt}"

Требования к сценарию:
1. Количество аккаунтов участников: {min(accounts_count, len(existing_accs))}.
2. Список доступных ID ролей (ролей аккаунтов): {existing_accs[:accounts_count]}.
3. Сгенерируй от 3 до 6 шагов (реплик).
4. Каждому шагу укажи:
   - step_order (1, 2, 3...)
   - role_id (один из доступных ID)
   - text (живой текст реплики)
   - reply_to_index (null для первого шага, или номер шага N 1-based, на который отвечает реплика)
   - delay_before_min (от 3.0 до 8.0)
   - delay_before_max (от 9.0 до 20.0)
   - reactions ({'эмодзи под сообщениями, например "🔥 👍 🚀"' if reactions_enabled else 'null'})
   - reaction_count ({'число от 1 до 3' if reactions_enabled else 0})

Верни строго JSON объект следующей структуры:
{{
  "title": "Название сценария",
  "min_delay": 5.0,
  "max_delay": 15.0,
  "steps": [
    {{
      "step_order": 1,
      "role_id": {existing_accs[0]},
      "text": "Текст первого сообщения",
      "reply_to_index": null,
      "delay_before_min": 5.0,
      "delay_before_max": 10.0,
      "reactions": "🔥 👍",
      "reaction_count": 2
    }}
  ]
}}
"""

    raw_response = await call_ai_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_instructions,
        json_mode=True
    )

    # Clean markdown backticks if present
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        return data
    except Exception as e:
        logger.error(f"Failed to parse AI generated scenario JSON: {e}, raw: {cleaned}")
        raise ValueError(f"AI returned invalid JSON: {cleaned[:200]}")

async def generate_dynamic_step_text(
    session: AsyncSession,
    post_text: str,
    step_prompt: str,
    persona_instruction: Optional[str] = None,
    thread_history: Optional[List[Dict[str, str]]] = None,
    override_provider: Optional[str] = None,
    override_model: Optional[str] = None
) -> str:
    """Generate dynamic context-aware reply for a bot during real Telegram scenario execution."""
    settings = await get_ai_settings(session)
    provider = override_provider or settings["provider"]
    api_key = settings["api_key"]
    model = override_model or settings["default_model"]

    system_prompt = persona_instruction or settings["system_prompt"]

    history_str = ""
    if thread_history:
        history_str = "Предыдущие сообщения в этом обсуждении:\n" + "\n".join(
            [f"• {h.get('sender', 'Участник')}: {h.get('text', '')}" for h in thread_history]
        )

    user_instructions = f"""
Контекст публикации в канале Telegram:
"{post_text or 'Публикация в канале'}"

{history_str}

Инструкция к твоей текущей реплике:
"{step_prompt or 'Напиши уместный короткий комментарий по теме'}"

Напиши короткий, естественный ответ (1-2 предложения), как живой пользователь Telegram.
Не используй кавычки вокруг ответа.
"""

    reply_text = await call_ai_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_instructions,
        json_mode=False
    )

    # Clean surrounding quotes
    cleaned = reply_text.strip().strip('"').strip("'")
    return cleaned
