import json
import logging
from typing import Optional, Dict, Any, List
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import SystemConfig, Account

logger = logging.getLogger(__name__)

# Default system prompt eliminating AI-generated / mechanical slop
DEFAULT_SYSTEM_PROMPT = """# ИНСТРУКЦИЯ ПЕРСОНАЖА (ANTI-AI TELEGRAM COMMENTATOR ENGINE v2.1.1)

# 1. ОСНОВНАЯ РОЛЬ И ЦЕЛЬ
Ты — реальный живой человек, комментирующий публикации в Telegram-каналах. Твоя главная задача — генерировать 100% правдоподобные реплики, которые абсолютно неотличимы от сообщений настоящих пользователей. Текст должен быть естественным, спонтанным и живым.

# 2. ЖЕСТКИЙ ЗАПРЕТ НА "ИИ-ШТАМПЫ", ДЛИННОЕ ТИРЕ И ПОДЛИЗЫВАНИЕ
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ДЛИННОЕ ТИРЕ ("—" или "–"). Настоящие люди с телефона не ставят длинные тире! Используй дефис "-", либо пиши вовсе без тире.
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ПОДЛИЗЫВАНИЕ И ЛЕССТЬ ("Отличная статья", "Автор молодец", "Очень полезный пост", "Спасибо автору за информацию", "Полностью поддерживаю автора"). Пиши свое независимое мнение, скепсис, подколы или короткие замечания.
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ формальные приветствия и прощания ("Здравствуйте", "Приветствую", "С уважением", "Всего доброго").
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ подытоживающие выводы и вводные клише ("Таким образом", "В итоге", "Важно отметить", "Следует подчеркнуть", "В заключение").
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ искусственные маркеры списков (1., 2., •, -), кавычки вокруг ответа, оформление в виде кода (```) и служебные префиксы ("Пользователь:", "Бот:", "Ответ:").
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ вежливые корпоративные шаблоны нейросетей ("Надеюсь, это было полезно", "Отличный вопрос").
- Не используй академическую идеальную структурированность. Живые люди пишут отрывисто, эмоционально и спонтанно.

# 3. СТИЛЬ, ОПЕЧАТКИ И КУЛЬТУРА ОБЩЕНИЯ В TELEGRAM
- ДЛИНА: Разнообразная. От 1-2 слов ("Хаха точно", "Жесть", "Плюс", "Мдаа") до 1-2 коротких предложений. Очень редко — 3 предложения.
- ОПЕЧАТКИ И СОКРАЩЕНИЯ: ОЧЕНЬ ИЗРЕДКА (не в каждом сообщении, а спорадически!) можешь случайно перепутать или пропустить соседние буквы, как при быстром наборе на сенсорном экране (например: "солнце" -> "слонце", "тоже" -> "тож", "сейчас" -> "щас", "вообще" -> "вобще", "потому что" -> "потомучто").
- РЕГИСТР И ПУНКТУАЦИЯ: Пиши как с телефона — часто без заглавной буквы в начале предложения, без точки в конце, со скобками вместо эмодзи))), с вопросительными или восклицательными знаками (??, !!).
- ЛЕКСИКА: Используй разговорный сленг (хз, ппц, чот, спс, норм, оффтоп, имхо, лол, фейк, рофл), простые обиходные фразы и междометия (ого, мда, эх, мб).

# 4. РАБОТА С КОНТЕКСТОМ И ПАМЯТЬЮ ТРЕДА
- Твоя реплика должна органично вытекать из текста поста и предыдущих сообщений участников.
- Если в треде идет спор — выбирай сторону, переспрашивай, иронизируй, подкалывай или приводи короткие живые аргументы.
- Не повторяй чужие мысли и формулировки. Каждый участник имеет собственный характер: от скептика и юмориста до восторженного фаната или молчаливого очевидца.

# 5. ФОРМАТ ВЫВОДА
Выдавай ТОЛЬКО чистый текст реплики от первого лица без каких-либо кавычек, префиксов и комментариев."""

# Default model fallbacks per provider
DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "deepseek": "deepseek-chat",
    "nvidia": "deepseek-ai/deepseek-r1",
    "openrouter": "openai/gpt-4o-mini",
    "gemini": "gemini-1.5-flash",
    "custom": "deepseek-ai/deepseek-r1"
}

# API Endpoint base URLs per provider
PROVIDER_URLS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "deepseek": "https://api.deepseek.com/v1/chat/completions",
    "nvidia": "https://integrate.api.nvidia.com/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions"
}

async def get_ai_settings(session: AsyncSession) -> Dict[str, Any]:
    """Retrieve saved AI credentials from system_config table."""
    keys = ["ai_provider", "ai_api_key", "ai_default_model", "ai_system_prompt", "ai_base_url"]
    result = {}
    for k in keys:
        stmt = select(SystemConfig).where(SystemConfig.key == k)
        res = (await session.execute(stmt)).scalars().first()
        result[k] = res.value if res else None
    
    provider = result.get("ai_provider") or "openai"
    model = result.get("ai_default_model") or DEFAULT_MODELS.get(provider, "gpt-4o-mini")
    raw_prompt = result.get("ai_system_prompt")
    
    # Automatically upgrade legacy default prompts to the new comprehensive v2.1.1 Anti-AI prompt
    if not raw_prompt or "Ты ведешь естественный человеческий диалог" in raw_prompt:
        system_prompt = DEFAULT_SYSTEM_PROMPT
    else:
        system_prompt = raw_prompt
    
    return {
        "provider": provider,
        "api_key": result.get("ai_api_key"),
        "default_model": model,
        "system_prompt": system_prompt,
        "base_url": result.get("ai_base_url")
    }

async def call_ai_completion(
    provider: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    json_mode: bool = False,
    base_url: Optional[str] = None
) -> str:
    """Call AI API for OpenAI, DeepSeek, NVIDIA NIM, OpenRouter, Gemini, or Custom endpoint."""
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
            # Universal OpenAI-compatible endpoint resolution
            if base_url and base_url.strip():
                url = base_url.strip().rstrip("/")
                if not url.endswith("/chat/completions"):
                    if url.endswith("/v1"):
                        url += "/chat/completions"
                    else:
                        url += "/chat/completions"
            else:
                url = PROVIDER_URLS.get(provider, PROVIDER_URLS["openai"])

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            # Auto-detect OpenRouter from URL for required headers
            if "openrouter.ai" in url:
                headers["HTTP-Referer"] = "https://tgactor.local"
                headers["X-Title"] = "TgActor"

            # Use exact user-specified model without hardcoded replacements
            final_model = model.strip() if (model and model.strip()) else DEFAULT_MODELS.get(provider, "gpt-4o-mini")

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            payload: Dict[str, Any] = {
                "model": final_model,
                "messages": messages,
                "temperature": 0.7
            }
            if json_mode and provider in ["openai", "deepseek"]:
                payload["response_format"] = {"type": "json_object"}

            logger.info(f"AI request -> {url} model={final_model}")
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                err_text = resp.text[:400]
                if api_key and len(api_key) > 4 and api_key in err_text:
                    err_text = err_text.replace(api_key, "***MASKED_KEY***")
                raise RuntimeError(f"API Error ({resp.status_code}): {err_text}")
            
            try:
                data = resp.json()
            except Exception:
                raise RuntimeError(f"{provider.upper()} API returned non-JSON response. Check Base URL endpoint.")

            choices = data.get("choices", [])
            if not choices:
                raise RuntimeError(f"{provider.upper()} API returned no choices. Response data: {data}")

            msg = choices[0].get("message", {})
            raw_content = msg.get("content") or msg.get("reasoning_content") or choices[0].get("text") or ""

            # Clean DeepSeek R1 <think>...</think> reasoning tags if present
            if isinstance(raw_content, str) and "<think>" in raw_content:
                if "</think>" in raw_content:
                    raw_content = raw_content.split("</think>")[-1].strip()
                else:
                    raw_content = raw_content.split("<think>")[0].strip()

            return raw_content

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

    if not api_key:
        raise ValueError("Не настроен API Key ИИ. Пожалуйста, нажмите 'ИИ НАСТРОЙКИ' и введите ваш API ключ.")

    # Get active account IDs to assign roles realistically
    acc_stmt = select(Account.id).where(Account.is_active == True)
    existing_accs = list((await session.execute(acc_stmt)).scalars().all())
    if not existing_accs:
        existing_accs = [1, 2, 3]

    available_roles = existing_accs[:accounts_count]
    if len(available_roles) < accounts_count:
        max_id = max(existing_accs) if existing_accs else 0
        extra_needed = accounts_count - len(available_roles)
        available_roles.extend([max_id + i + 1 for i in range(extra_needed)])

    system_prompt = (
        "Ты — генератор сценариев реального человеческого общения в комментариях Telegram. "
        "Создай структурированный диалог на русском языке в формате JSON. "
        "Диалог должен звучать 100% естественно, живой разговорный сленг, с репликами и эмодзи."
    )

    user_instructions = f"""
Создай сценарий общения по следующему описанию:
"{prompt}"

Требования к сценарию:
1. Количество участников (ролей): {accounts_count}.
2. Список доступных ID ролей: {available_roles}.
3. Сгенерируй от 4 до 8 естественных шагов (реплик общения).
4. Каждому шагу укажи:
   - step_order (1, 2, 3...)
   - role_id (один из доступных ID ролей: {available_roles})
   - text (живой текст реплики)
   - reply_to_index (null для первого шага, или номер шага N 1-based, на который отвечает реплика)
   - delay_before_min (от 3.0 до 8.0)
   - delay_before_max (от 9.0 до 20.0)
   - reactions ({'ВАЖНО: ставь эмодзи-реакции УМНО и ВЫБОРОЧНО (НЕ на каждое сообщение, а примерно на 30-40% сообщений, например "🔥" или "👍". Для остальных пиши null)' if reactions_enabled else 'null'})
   - reaction_count ({'число от 1 до 2' if reactions_enabled else 0})

Верни строго JSON объект следующей структуры:
{{
  "title": "Название сценария",
  "min_delay": 5.0,
  "max_delay": 15.0,
  "steps": [
    {{
      "step_order": 1,
      "role_id": {available_roles[0]},
      "text": "Текст первого сообщения",
      "reply_to_index": null,
      "delay_before_min": 5.0,
      "delay_before_max": 10.0,
      "reactions": null,
      "reaction_count": 0
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
        json_mode=True,
        base_url=settings.get("base_url")
    )

    # Clean markdown backticks and extract valid JSON object
    cleaned = raw_response.strip()
    if "```" in cleaned:
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[-1].split("```")[0].strip()
        else:
            parts = cleaned.split("```")
            if len(parts) >= 3:
                cleaned = parts[1].strip()
    if not cleaned.startswith("{") and "{" in cleaned:
        cleaned = "{" + cleaned.split("{", 1)[-1]
    if not cleaned.endswith("}") and "}" in cleaned:
        cleaned = cleaned.rsplit("}", 1)[0] + "}"

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
        json_mode=False,
        base_url=settings.get("base_url")
    )

    # Clean surrounding quotes
    cleaned = reply_text.strip().strip('"').strip("'")
    return cleaned
