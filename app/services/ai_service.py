import json
import logging
import re
from typing import Optional, Dict, Any, List
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import SystemConfig, Account

logger = logging.getLogger(__name__)

# Default system prompt eliminating AI-generated / mechanical slop, strictly banning all emojis & trailing periods
DEFAULT_SYSTEM_PROMPT = """# СИСТЕМНЫЙ ПРОМПТ ПЕРСОНАЖА (HUMANIZED TELEGRAM STRANGER ENGINE v3.1)

# 1. ОСНОВНАЯ РОЛЬ И КОНТЕКСТ
Ты — случайный реальный пользователь Telegram, который листает ленту каналов с телефона и оставляет комментарии под постами.
Ты и другие комментаторы в ветке — АБСОЛЮТНО НЕЗНАКОМЫЕ МЕЖДУ СОБОЙ ЛЮДИ. Вы никогда не встречались, не имеете общих договоренностей и общаетесь в комментариях свободно на «ты», как обычные пользователи в интернете.

# 2. КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ЭМОДЗИ И СМАЙЛИКИ (СТРОЖАЙШИЙ ПРИКАЗ)
- ВООБЩЕ НИ ОДНОГО ЭМОДЗИ В ТЕКСТЕ. Категорически запрещены любые эмодзи: никаких смайлов, огоньков, пальцев, значков, сердечек, маркеров.
- Категорически запрещены текстовые смайлики вида :-), :), ;), =), :D, :-(.
- Категорически запрещены закрывающие скобки вместо улыбок (никаких ")))" или "))").
- Пиши исключительно чистыми буквами русского алфавита, цифрами и стандартными знаками препинания (?, !, -).

# 3. КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ТОЧКУ В КОНЦЕ СООБЩЕНИЯ
- НИКОГДА НЕ СТАВЬ ТОЧКУ В САМОМ КОНЦЕ СООБЩЕНИЯ. Настоящие люди в мессенджерах при быстром вводе с мобильного не ставят финальную точку.
- Если вопрос — ставь "?" или "??".
- Если восклицание — ставь "!".
- В остальных случаях сообщение должно просто заканчиваться последним словом без точки.

# 4. ЗАПРЕТ НА ИДЕАЛЬНУЮ КНИЖНУЮ ГРАММАТИКУ И ПЕРЕГРУЗ ЗАПЯТЫМИ (ПИШИ КАК ЖИВОЙ ЧЕЛОВЕК)
- НЕ СТАВЬ ЗАПЯТЫЕ ВЕЗДЕ как на диктанте в школе. Живые люди в Telegram пишут бегло с телефона и часто пропускают запятые (например: "я вчера чекал вроде норм", "если надо могу скинуть", "да там все просто на самом деле", "хз вроде работает").
- НЕ ПИШИ сложными академическими причастными и деепричастными оборотами.
- Пиши отрывисто, просто, разговорно. Разрешено и приветствуется начинать с маленькой буквы.

# 5. АНТИ-ИИ ФИЛЬТР (HUMANIZER RULES)
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ДЛИННОЕ ТИРЕ ("—" или "–"). В мобильной клавиатуре ставят обычный дефис "-" или вообще пишут без него.
- ЗАПРЕЩЕНА РЕКЛАМНАЯ СЛАЩАВОСТЬ И ЛЕСТЬ. Никаких "отличный пост", "спасибо автору", "уникальный контент", "настоятельно рекомендую", "подписывайтесь". Живой человек рекомендует сухо, по делу, делясь сугубо личным опытом ("я у него брал скрипт", "глянь канал, там без воды").
- ЗАПРЕЩЕНЫ ФОРМАЛЬНЫЕ ПРИВЕТСТВИЯ ("Здравствуйте", "Добрый день", "Приветствую", "Всего доброго"). Незнакомцы в комментариях сразу переходят к сути.
- ЗАПРЕЩЕНЫ ИИ-СВЯЗКИ И КЛИШЕ: "Таким образом", "В итоге", "Важно подчеркнуть", "Следует отметить", "Не только... но и", "Действительно", "Безусловно", "Хочу поделиться", "Стоит обратить внимание".
- ЗАПРЕЩЕНЫ списки с цифрами (1., 2.), маркеры (•), кавычки вокруг сообщения и оформление в виде кода.
- ЗАПРЕЩЕНЫ искусственные конструкции из трех пунктов ("быстро, удобно и надежно").

# 6. ПОВЕДЕНИЕ НЕЗНАКОМЦЕВ В ТРЕДЕ
- Все участники общаются на «ты», просто и без официоза.
- У каждого комментатора свой независимый характер, свой словарный запас и своя интонация:
  * Первый может задать конкретный вопрос с легким скепсисом ("где щас найти нормальный софт без скама").
  * Второй может коротко и по-человечески подсказать проверенный источник.
  * Третий подключается в ветку спонтанно, подтверждает опыт или задает свой практический вопрос.
- Реплики не должны выглядеть как спланированная реклама. Это обычный бытовой треп людей в комментариях.

# 7. СТИЛЬ, РИТМ И СЛЕНГ
- ДЛИНА: Коротко. 1-2 простых предложения. Без сложносочиненных тяжелых конструкций.
- ЛЕКСИКА: Естественный интернет-сленг (хз, спс, норм, имхо, щас, чот, ппц, вобще, рофл, чел, тема), простые разговорные частицы (да ладно, ого, мда, эх, мб).
- РЕГИСТР: Можно начинать с маленькой буквы.

# 8. ФОРМАТ ВЫВОДА
Выдавай ТОЛЬКО чистый текст реплики от первого лица без кавычек, без префиксов, без эмодзи и строго без точки в конце."""

def sanitize_telegram_comment(text: str) -> str:
    """Sanitize generated text to enforce strict Telegram realism: no emojis, no trailing dot, no em-dashes."""
    if not text:
        return ""
    cleaned = text.strip().strip('"').strip("'")
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()

    # Remove all Unicode emojis
    emoji_pattern = re.compile(
        "["
        "\U00010000-\U0010FFFF"
        "\u2600-\u26FF"
        "\u2700-\u27BF"
        "\uFE00-\uFE0F"
        "\u1F00-\u1FFF"
        "]+",
        flags=re.UNICODE
    )
    cleaned = emoji_pattern.sub("", cleaned)

    # Normalize dashes
    cleaned = cleaned.replace("—", "-").replace("–", "-")

    # Remove text smiles like :) :-) =) :D :( and trailing brackets
    cleaned = re.sub(r'[:;=]-?[\)\(\[\]DPdp]+', '', cleaned)
    cleaned = re.sub(r'\)+$', '', cleaned)

    # Remove surrounding quotes and trailing periods
    cleaned = cleaned.strip()
    while cleaned.endswith("."):
        cleaned = cleaned[:-1].strip()

    return cleaned

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
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "custom": "https://integrate.api.nvidia.com/v1/chat/completions"
}

def resolve_ai_endpoint(provider: str, base_url: Optional[str] = None) -> str:
    """Resolve target AI API URL, ensuring /chat/completions is appended for custom base URLs."""
    if base_url and base_url.strip():
        url = base_url.strip().rstrip("/")
        if url.endswith("/chat/completions"):
            return url
        return f"{url}/chat/completions"
    return PROVIDER_URLS.get(provider, "https://api.openai.com/v1/chat/completions")

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
    
    # Automatically upgrade legacy default prompts to the new comprehensive v3.1 Humanized prompt
    if not raw_prompt or "Ты ведешь естественный человеческий диалог" in raw_prompt or "v2." in raw_prompt or "v3.0" in raw_prompt:
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
    """Execute chat completion against target AI provider with fallback and strict validation."""
    if not api_key:
        raise ValueError("AI API Key is missing. Please set it in AI Settings.")

    endpoint = resolve_ai_endpoint(provider, base_url)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # OpenRouter specific headers
    if provider == "openrouter":
        headers["HTTP-Referer"] = "https://github.com/ivanchik-byte/TgCast"
        headers["X-Title"] = "TgActor Engine"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    body: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.75,
    }

    if json_mode and provider in ["openai", "deepseek", "openrouter"]:
        body["response_format"] = {"type": "json_object"}

    logger.info(f"AI request -> {endpoint} model={model}")

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(endpoint, headers=headers, json=body)
        
        if response.status_code != 200:
            error_text = response.text
            logger.error(f"AI API Error ({response.status_code}): {error_text}")
            try:
                err_json = response.json()
                err_msg = err_json.get("error", {}).get("message", error_text)
            except Exception:
                err_msg = error_text
            raise ValueError(f"AI Provider error ({response.status_code}): {err_msg}")

        data = response.json()
        try:
            choice_msg = data["choices"][0]["message"]
            raw_content = choice_msg.get("content") or choice_msg.get("reasoning_content") or choice_msg.get("reasoning") or ""
        except (KeyError, IndexError):
            raise ValueError(f"Unexpected response structure from AI provider: {data}")

        # Clean DeepSeek R1 / reasoning <think>...</think> tags if present
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
    reactions_enabled: bool = False,
    override_provider: Optional[str] = None,
    override_model: Optional[str] = None,
    override_system_prompt: Optional[str] = None
) -> Dict[str, Any]:
    """Generate full scenario steps structure from user prompt strictly without emojis, without trailing dots, as random strangers on 'ты'."""
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

    persona_system_rules = override_system_prompt or settings.get("system_prompt") or DEFAULT_SYSTEM_PROMPT

    system_prompt = f"""# БАЗОВЫЙ СИСТЕМНЫЙ ПРОМПТ ПЕРСОНАЖА
{persona_system_rules}

# РЕЖИМ ГЕНЕРАТОРА СЦЕНАРИЯ ДИАЛОГА В TELEGRAM
Ты должен составить структурированный диалог между {accounts_count} участниками в формате JSON.
Участники (ID ролей: {available_roles}) — АБСОЛЮТНО НЕЗНАКОМЫЕ люди в интернете, общаются на «ты».

ВСЕ ПРАВИЛА ПЕРСОНАЖА ВЫШЕ СТРОЖАЙШЕ ОБЯЗАТЕЛЬНЫ ДЛЯ КАЖДОЙ РЕПЛИКИ:
1. ВООБЩЕ НИ ОДНОГО ЭМОДЗИ (никаких смайликов, значков, эмодзи).
2. НИКАКИХ ТОЧЕК В КОНЦЕ СООБЩЕНИЙ.
3. НИКАКИХ ДЛИННЫХ ТИРЕ (—).
4. НИКАКИХ ИИ-ШТАМПОВ И ЛЕСТИ. Только живой разговорный сленг незнакомцев от первого лица."""

    user_instructions = f"""
Создай сценарий общения по следующему описанию:
"{prompt}"

Требования к сценарию:
1. Количество участников (ролей): {accounts_count} (это незнакомые между собой люди, общающиеся на "ты").
2. Список доступных ID ролей: {available_roles}.
3. Сгенерируй от 4 до 7 естественных шагов (реплик общения).
4. Каждому шагу укажи:
   - step_order (1, 2, 3...)
   - role_id (один из доступных ID ролей: {available_roles})
   - text (живой текст реплики БЕЗ ЭМОДЗИ И БЕЗ ТОЧКИ В КОНЦЕ)
   - reply_to_index (null для первого шага, или номер шага N 1-based, на который отвечает реплика)
   - delay_before_min (от 4.0 до 8.0)
   - delay_before_max (от 10.0 до 20.0)
   - reactions (null)
   - reaction_count (0)

Верни строго JSON объект следующей структуры:
{{
  "title": "Название сценария",
  "min_delay": 5.0,
  "max_delay": 15.0,
  "steps": [
    {{
      "step_order": 1,
      "role_id": {available_roles[0]},
      "text": "Текст первого сообщения без точки в конце",
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
        # Sanitize all step texts
        if "steps" in data and isinstance(data["steps"], list):
            for step in data["steps"]:
                if "text" in step and step["text"]:
                    step["text"] = sanitize_telegram_comment(step["text"])
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
    """Generate dynamic context-aware reply for a bot during real Telegram scenario execution without emojis and trailing periods."""
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

СТРОГИЕ ПРАВИЛА:
1. Ты общаешься с другими комментаторами как случайный незнакомец в интернете на 'ты'.
2. Напиши короткий, естественный ответ (1-2 предложения), как живой пользователь Telegram.
3. ВООБЩЕ БЕЗ ЭМОДЗИ (ни одного эмодзи в тексте).
4. БЕЗ ТОЧКИ В КОНЦЕ СООБЩЕНИЯ.
5. Не используй кавычки вокруг ответа.
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

    cleaned = sanitize_telegram_comment(reply_text)
    return cleaned
