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

def robust_json_loads(raw: str) -> Any:
    """Robustly extract and parse JSON from LLM outputs, tolerating markdown, think tags, trailing commas, and formatting quirks."""
    if not raw:
        raise ValueError("Empty response from AI")
    
    text = raw.strip()
    
    # Remove <think>...</think> if present
    if "<think>" in text:
        if "</think>" in text:
            text = text.split("</think>")[-1].strip()
        else:
            text = text.split("<think>")[0].strip()
            
    # Extract from markdown block ```json ... ``` or ``` ... ```
    if "```" in text:
        match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if match:
            text = match.group(1).strip()

    # Find the outermost { ... } or [ ... ]
    brace_match = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', text)
    if brace_match:
        text = brace_match.group(1).strip()

    # Attempt 1: Direct standard parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # Attempt 2: Strip trailing commas before } or ]
    clean_commas = re.sub(r',\s*([\}\]])', r'\1', text)
    try:
        return json.loads(clean_commas)
    except Exception:
        pass

    # Attempt 3: Ast literal eval if single quotes were used
    try:
        import ast
        val = ast.literal_eval(text)
        if isinstance(val, (dict, list)):
            return val
    except Exception:
        pass

    # Attempt 4: Clean control characters
    clean_ctrl = re.sub(r'[\x00-\x1f\x7f-\x9f]', ' ', clean_commas)
    return json.loads(clean_ctrl)

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
    base_url: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: float = 0.92
) -> str:
    """Execute chat completion against target AI provider with high timeout and strict validation."""
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
        "temperature": temperature,
    }

    if max_tokens:
        body["max_tokens"] = max_tokens

    if json_mode and provider in ["openai", "deepseek", "openrouter", "custom", "nvidia"]:
        body["response_format"] = {"type": "json_object"}

    logger.info(f"AI request -> {endpoint} model={model} (temp={temperature}, max_tokens={max_tokens or 'auto'})")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
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
    except httpx.TimeoutException:
        raise ValueError(f"Таймаут соединения с ИИ: модель '{model}' генерировала ответ дольше 300 сек. Попробуйте более быструю модель или повторите запрос.")

async def generate_scenario_from_prompt(
    session: AsyncSession,
    prompt: str,
    accounts_count: int = 3,
    steps_count: Optional[int] = None,
    reactions_enabled: bool = False,
    is_dynamic: bool = False,
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

    # Determine desired steps count
    target_steps = steps_count
    if not target_steps:
        match = re.search(r'(\d+)\s*(?:-|до)?\s*(\d+)?\s*(?:смс|сообщен|реплик|шаг)', prompt.lower())
        if match:
            try:
                g1 = int(match.group(1))
                g2 = int(match.group(2)) if match.group(2) else g1
                target_steps = max(g1, g2)
            except Exception:
                target_steps = 7
        else:
            target_steps = 7
    target_steps = max(3, min(25, target_steps))

    persona_system_rules = override_system_prompt or settings.get("system_prompt") or DEFAULT_SYSTEM_PROMPT

    system_prompt = f"""# БАЗОВЫЙ СИСТЕМНЫЙ ПРОМПТ ПЕРСОНАЖА
{persona_system_rules}

# РЕЖИМ ГЕНЕРАТОРА {'ДИНАМИЧЕСКОГО (ПРОМПТЫ ВМЕСТО СМС)' if is_dynamic else 'КОНСТРУКТИВНОГО'} СЦЕНАРИЯ ДИАЛОГА В TELEGRAM
Ты должен составить логичный, глубоко связный диалог между {accounts_count} участниками в формате JSON.
Участники (ID ролей: {available_roles}) — АБСОЛЮТНО НЕЗНАКОМЫЕ люди в интернете, общаются на «ты».

ВСЕ ПРАВИЛА ПЕРСОНАЖА ВЫШЕ СТРОЖАЙШЕ ОБЯЗАТЕЛЬНЫ ДЛЯ КАЖДОЙ РЕПЛИКИ:
1. ВООБЩЕ НИ ОДНОГО ЭМОДЗИ (никаких смайликов, значков, эмодзи).
2. НИКАКИХ ТОЧЕК В КОНЦЕ СООБЩЕНИЙ.
3. НИКАКИХ ДЛИННЫХ ТИРЕ (—).
4. НИКАКОГО ПЕРЕГРУЗА ЗАПЯТЫМИ — пиши небрежно, просто, без книжных оборотов.
5. НИКАКИХ ИИ-ШТАМПОВ И ЛЕСТИ. Только живой технический/разговорный язык незнакомцев от первого лица."""

    dynamic_instructions = """
РЕЖИМ: ДИНАМИЧЕСКИЕ ИНСТРУКЦИИ-ПРОМПТЫ ДЛЯ БОТОВ (ВМЕСТО ФИКСИРОВАННЫХ СМС):
Для каждого шага составь детальную инструкцию в поле "ai_prompt":
1. Четкая цель реплики (что именно бот должен спросить, аргументировать или посоветовать).
2. Конкретные детали (какие технические нюансы, опыт или ссылки упомянуть без слащавости).
3. Тон и отношение к собеседнику (на "ты", скепсис, практический совет, живое удивление).
В поле "text" запиши краткую тему шага, а в "is_ai_dynamic" укажи true.
""" if is_dynamic else ""

    user_instructions = f"""
Создай сценарий {'динамического (промпты для нейросети)' if is_dynamic else 'реалистичного'} диалога по заданию пользователя:
"{prompt}"

{dynamic_instructions}
ТРЕБОВАНИЯ К ДИАЛОГУ:
1. СТРОГОЕ СОБЛЮДЕНИЕ ТЕМЫ: Сценарий, роли и реплики должны на 100% соответствовать теме из задания пользователя ("{prompt}"). Запрещено навязывать посторонние темы (софт, автоматизацию, каналы), если пользователь явно не просил об этом!
2. Количество участников (ролей): {accounts_count}. Доступные ID ролей: {available_roles}.
3. Количество реплик: СТРОГО {target_steps} шагов.

4. РАСПРЕДЕЛЕНИЕ И ДРАМАТУРГИЯ РОЛЕЙ:
   - Органично распредели роли участников в соответствии с темой задания пользователя.
   - РОЛЬ 1 (ID {available_roles[0]}): Открывает диалог по теме задания (reply_to_step = null), задает вопрос или делится мыслью.
   - РОЛЬ 2 (ID {available_roles[1] if len(available_roles) > 1 else available_roles[0]}): Отвечает Роли 1 по существу темы пользователя.
   - РОЛЬ 3 (ID {available_roles[2] if len(available_roles) > 2 else (available_roles[1] if len(available_roles) > 1 else available_roles[0])}): Подключается в ветку диалога с уместной репликой по теме.

5. ПРАВИЛА ВЕТВЛЕНИЯ (ОТВЕТЫ ПО СМЫСЛУ):
   - Шаг 1: reply_to_step = null.
   - Шаги 2..{target_steps}: reply_to_step ДОЛЖЕН указывать на номер того шага, на который адресно отвечает собеседник (не по порядку N-1, а логический адресат).
   - СТРОГО: reply_to_step < текущего step_order.

6. УМНЫЕ РЕАКЦИИ (СТРОГО ИЗРЕДКА, МАКСИМУМ 1 НА ВЕСЬ ДИАЛОГ):
   {'- Ставь одиночную реакцию ("👍", "🔥", "⚡", "❤️") с reaction_count: 1 ТОЛЬКО ИЗРЕДКА — максимум на 1 полезное сообщение за весь тред (либо 0 реакций, если явного повода нет). На всех остальных сообщениях: reactions: null, reaction_count: 0.' if reactions_enabled else '- reactions: null, reaction_count: 0 для всех шагов.'}

7. СТИЛЬ:
   - СТРОГО БЕЗ ЭМОДЗИ В ТЕКСТЕ СООБЩЕНИЙ, БЕЗ ТОЧЕК В КОНЦЕ СООБЩЕНИЙ, БЕЗ ДЛИННЫХ ТИРЕ, БЕЗ ЛИШНИХ ЗАПЯТЫХ.
   - Живой разговорный язык незнакомцев в Telegram от первого лица.

Верни строго JSON объект следующей структуры:
{{
  "title": "Название темы диалога",
  "min_delay": 5.0,
  "max_delay": 15.0,
  "steps": [
    {{
      "step_order": 1,
      "role_id": {available_roles[0]},
      "text": "краткая суть первого сообщения без точки в конце",
      "ai_prompt": "Инструкция боту: Напиши комментарий по заданной теме от первого лица...",
      "is_ai_dynamic": {str(is_dynamic).lower()},
      "reply_to_step": null,
      "delay_before_min": 5.0,
      "delay_before_max": 10.0,
      "reactions": null,
      "reaction_count": 0
    }},
    {{
      "step_order": 2,
      "role_id": {available_roles[1] if len(available_roles) > 1 else available_roles[0]},
      "text": "краткая суть ответа второго участника",
      "ai_prompt": "Инструкция боту: Ответь первому собеседнику по существу темы...",
      "is_ai_dynamic": {str(is_dynamic).lower()},
      "reply_to_step": 1,
      "delay_before_min": 4.0,
      "delay_before_max": 9.0,
      "reactions": "👍",
      "reaction_count": 1
    }}
  ]
}}"""

    raw_response = await call_ai_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_instructions,
        json_mode=True,
        base_url=settings.get("base_url"),
        max_tokens=3500,
        temperature=0.94
    )

    # Robustly parse JSON from raw response
    try:
        data = robust_json_loads(raw_response)
        if isinstance(data, list):
            data = {"title": "Диалог в комментариях", "steps": data}
        elif isinstance(data, dict) and "scenario" in data and isinstance(data["scenario"], dict):
            data = data["scenario"]

        # Ensure steps array is present
        steps_list = data.get("steps") or []
        if not isinstance(steps_list, list) and isinstance(data, dict):
            # Check if steps were keyed differently
            for k in ["replicas", "items", "messages", "dialogue"]:
                if k in data and isinstance(data[k], list):
                    steps_list = data[k]
                    break

        # Sanitize and validate every step
        sanitized_steps = []
        for idx, step in enumerate(steps_list):
            if not isinstance(step, dict):
                continue
            step_num = idx + 1
            role_val = step.get("role_id") or step.get("role") or available_roles[idx % len(available_roles)]
            try:
                role_int = int(role_val)
            except Exception:
                role_int = available_roles[idx % len(available_roles)]

            # Ensure role alternation if possible
            if idx > 0 and len(available_roles) > 1 and role_int == sanitized_steps[idx-1]["role_id"]:
                other_roles = [r for r in available_roles if r != role_int]
                if other_roles:
                    role_int = other_roles[(idx) % len(other_roles)]

            # Parse reply_to_step / reply_to_index
            raw_reply = step.get("reply_to_step")
            if raw_reply is None:
                raw_reply = step.get("reply_to_index")
            
            target_reply_step = None
            if step_num > 1:
                if raw_reply is not None:
                    try:
                        r_int = int(raw_reply)
                        # If 1-based step: 1 <= r_int < step_num
                        if 1 <= r_int < step_num:
                            target_reply_step = r_int
                        # If 0-based index: 0 <= r_int < idx
                        elif 0 <= r_int < idx:
                            target_reply_step = r_int + 1
                        else:
                            # Fallback to previous step
                            target_reply_step = step_num - 1
                    except Exception:
                        target_reply_step = step_num - 1
                else:
                    target_reply_step = step_num - 1

            raw_txt = step.get("text") or step.get("message") or ""
            clean_txt = sanitize_telegram_comment(str(raw_txt))

            # Dynamic AI step instructions
            step_is_dynamic = bool(step.get("is_ai_dynamic") or is_dynamic)
            step_ai_prompt = step.get("ai_prompt") or step.get("prompt")
            if step_is_dynamic and not step_ai_prompt:
                step_ai_prompt = clean_txt or "Напиши уместный живой комментарий по теме поста"

            # Reaction filter
            step_reactions = None
            step_reaction_count = 0
            if reactions_enabled and step.get("reactions"):
                raw_react = str(step.get("reactions")).strip()
                valid_emojis = ["👍", "🔥", "⚡", "❤️", "🤝", "👏", "🎉", "🤩", "💯"]
                for ve in valid_emojis:
                    if ve in raw_react:
                        step_reactions = ve
                        step_reaction_count = max(1, min(3, int(step.get("reaction_count") or 1)))
                        break

            sanitized_steps.append({
                "step_order": step_num,
                "role_id": role_int,
                "text": clean_txt,
                "reply_to_step": target_reply_step,
                "reply_to_index": (target_reply_step - 1) if target_reply_step is not None else None,
                "delay_before_min": float(step.get("delay_before_min") or 4.0),
                "delay_before_max": float(step.get("delay_before_max") or 10.0),
                "reactions": step_reactions,
                "reaction_count": step_reaction_count,
                "is_ai_dynamic": step_is_dynamic,
                "ai_prompt": step_ai_prompt
            })

        data["steps"] = sanitized_steps
        if not data.get("title"):
            data["title"] = "Диалог в комментариях"

        return data
    except Exception as e:
        logger.error(f"Failed to parse AI generated scenario JSON: {e}, raw: {raw_response[:300]}")
        raise ValueError(f"Ошибка обработки ответа ИИ: {str(e)}")

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

Замысел твоей реплики:
"{step_prompt or 'Напиши уместный короткий комментарий по теме'}"

СТРОГИЕ ПРАВИЛА:
1. ПЕРЕФРАЗИРУЙ СВОИМИ СЛОВАМИ: Не копируй формулировки из замысла! Напиши реплику свежо, живо и оригинально.
2. Стиль: живой разговорный русский язык Telegram (сленг по делу: хз, по факту, норм, рил, годнота, бро, шарит).
3. Формат: 1-2 коротких предложения, строго от первого лица на 'ты'.
4. ВООБЩЕ БЕЗ ЭМОДЗИ (ни одного эмодзи в тексте).
5. БЕЗ ТОЧКИ В КОНЦЕ СООБЩЕНИЯ.
6. Не используй кавычки вокруг ответа.
"""

    reply_text = await call_ai_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_instructions,
        json_mode=False,
        base_url=settings.get("base_url"),
        max_tokens=90,
        temperature=0.92
    )

    cleaned = sanitize_telegram_comment(reply_text)
    return cleaned

async def generate_prompt_idea(
    session: AsyncSession,
    topic: Optional[str] = None,
    override_provider: Optional[str] = None,
    override_model: Optional[str] = None
) -> str:
    """Generate a flexible, varied, natural prompt idea for scenario generation."""
    settings = await get_ai_settings(session)
    provider = override_provider or settings.get("provider") or "deepseek"
    api_key = settings.get("api_key")
    model = override_model or settings.get("default_model") or settings.get("model") or "deepseek-chat"

    system_prompt = """Ты — эксперт по созданию сценариев для естественного комментирования в Telegram.
Твоя задача — составить ёмкую, гибкую и живую инструкцию (промпт) для сценария между незнакомыми людьми в комментариях.
Промпт должен задавать общую канву и контекст (какую тему обсуждают, какую мысль высказать, какой опыт подтвердить), но НЕ должен содержать заученных дословных цитат в кавычках.
Текст должен быть лаконичным (2-4 предложения) на русском языке."""

    user_prompt = f"""Сгенерируй идеальный вариативный промпт для диалога в Telegram.
Тема/пожелание: {topic if topic and topic.strip() else 'Случайная актуальная жизненная тема: обсуждение новости, реальный опыт использования продукта/услуги, практический совет или обмен мнениями в комментариях'}.

Структура промпта:
1. Кратко опиши, какой вопрос или тему поднимает первый участник.
2. Что по делу отвечает второй участник (без слащавой рекламы).
3. Как вклинивается третий участник (подтверждает опыт или делится мнением).
4. Укажи: строго без эмодзи в тексте, без точек на конце, живой разговорный сленг.

Верни ТОЛЬКО чистый текст промпта без лишних пояснений."""

    raw_text = await call_ai_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_mode=False,
        base_url=settings.get("base_url")
    )
    cleaned = raw_text.strip().strip('"').strip("'")
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
    return cleaned

async def enhance_prompt_description(
    session: AsyncSession,
    text: Optional[str] = None,
    override_provider: Optional[str] = None,
    override_model: Optional[str] = None
) -> str:
    """Enhance, expand, or generate a rich natural scene description with AI for Prompt Studio."""
    settings = await get_ai_settings(session)
    provider = override_provider or settings.get("provider") or "deepseek"
    api_key = settings.get("api_key")
    model = override_model or settings.get("default_model") or "deepseek-chat"

    if not api_key:
        raise ValueError("Не настроен API Key ИИ. Пожалуйста, откройте 'ИИ НАСТРОЙКИ' и введите ваш ключ.")

    system_prompt = """Ты — ведущий промпт-инженер для сценариев комментирования в Telegram.
Твоя задача — взять краткий черновой набросок или тему от пользователя и превратить его в глубокое, чёткое, живое описание сцены (2-3 предложения на русском языке).
Описание должно содержать:
1. Конкретную тему и проблему/интригу обсуждения строго по заданной пользователем сфере.
2. Мотивацию и распределение позиций участников (кто задает вопрос, кто советует или спорит, кто подтверждает опыт).
3. Требование писать без эмодзи, без финальных точек и на естественном разговорном языке.
Ответ должен быть строго текстом улучшенного описания (без вводных слов 'Вот улучшенный промпт:' и без кавычек)."""

    if text and text.strip():
        user_prompt = f"""Улучши и сделай детальнее следующее описание сцены для диалога в Telegram:
"{text.strip()}"

Сохрани исходную тему и идею пользователя (не меняй тему на постороннюю!), добавь естественной драматургии и четких ролевых ориентиров.
Верни ТОЛЬКО готовое улучшенное описание."""
    else:
        user_prompt = """Сгенерируй интересное и разностороннее описание сцены для диалога незнакомых людей в комментариях Telegram (любая жизненная тема: обсуждение новости, впечатления от сервиса/товара, практический совет или дискуссия).
Верни ТОЛЬКО готовое описание сцены."""

    raw_text = await call_ai_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_mode=False,
        base_url=settings.get("base_url")
    )
    cleaned = raw_text.strip().strip('"').strip("'")
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
    return cleaned

async def generate_studio_prompt(
    session: AsyncSession,
    topic: str,
    mode: str = "dynamic",
    drama_type: str = "skepticism_proof",
    tone: str = "telegram_slang",
    roles_count: int = 3,
    steps_count: Optional[int] = None,
    override_provider: Optional[str] = None,
    override_model: Optional[str] = None,
    override_system_prompt: Optional[str] = None
) -> Dict[str, Any]:
    """Generate high-converting structured scenario prompt, role breakdown, and steps payload in Prompt Studio."""
    settings = await get_ai_settings(session)
    provider = override_provider or settings.get("provider") or "deepseek"
    api_key = settings.get("api_key")
    model = override_model or settings.get("default_model") or "deepseek-chat"

    if not api_key:
        raise ValueError("Не настроен API Key ИИ. Пожалуйста, откройте 'ИИ НАСТРОЙКИ' и введите ваш ключ.")

    actual_steps_count = steps_count if (steps_count and steps_count >= 2) else max(roles_count, 3)

    drama_descriptions = {
        "skepticism_proof": "Скепсис -> Пруф -> Рекомендация (первый сомневается или озвучивает проблему, второй советует решение, третий подтверждает опытом по теме).",
        "warmup_interest": "Прогрев интереса (первый задает вопрос или делится инсайдом, второй раскрывает детали, третий уточняет нюансы).",
        "expert_qa": "Вопрос эксперту (первый задает вопрос по теме, второй дает практический совет, третий подтверждает полезность).",
        "friendly_dispute": "Живой спор мнений (два участника аргументированно отстаивают разные точки зрения без токсичности, третий подводит баланс).",
        "native_mention": "Нативное обсуждение (естественное обсуждение задачи и искреннее упоминание проверенного решения без рекламы).",
        "problem_solving": "Разбор проблемы и решение (жалоба на сложность -> разбор причины -> проверенный совет).",
        "crypto_insight": "Обсуждение рынка / крипта / финансы (быстрый обмен мнениями по комиссиям, инструментам и новостям).",
        "none": "Свободная драматургия без шаблона. Полная свобода: строй сценарий и реплики СТРОГО на основе темы и инструкций пользователя."
    }
    drama_desc = drama_descriptions.get(drama_type, drama_descriptions["none"])

    tone_descriptions = {
        "telegram_slang": "Живой разговорный сленг Telegram (хз, норм, по факту, рил, годнота, бро, шарит), короткие отрывистые фразы, без заумных слов.",
        "tech_slang": "Технический / Профи (термины по теме, по делу, аргументированно, без маркетинговой воды).",
        "concise_casual": "Максимально лаконичный бытовой стиль (1-2 простых предложения, простые слова, минимум знаков).",
        "crypto_trader": "Сленг трейдеров и криптанов (газ, комиссии, кошельки, переводы, холд, свап).",
        "cautious_skeptic": "Сдержанно-скептичный тон (осторожные вопросы, проверка фактов, недоверие к легким кнопкам).",
        "friendly_helper": "Дружелюбный советчик (помощь новичку без занудства и без лести).",
        "neutral": "Универсальный нейтральный стиль (простой человеческий язык без специфического сленга, живой диалог)."
    }
    tone_desc = tone_descriptions.get(tone, tone_descriptions["telegram_slang"])

    system_prompt = f"""Ты — элитный сценарист и архитектор промптов для комментирования в Telegram (Prompt Studio Engine v4.0).
Твоя цель — создавать ультра-реалистичные, живые диалоги между реальными пользователями интернета, которые невозможно отличить от настоящих людей.

СТРОЖАЙШЕЕ ПРАВИЛО ТЕМЫ:
- Сценарий, роли, ai_prompt и тексты ОБЯЗАНЫ быть СТРОГО на тему, которую указал пользователь!
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО навязывать темы про софт, автоматизацию, каналы или скрипты, если пользователь НЕ просил об этом явно! Если тема про авто, еду, фитнес, путешествия, ремонт или крипту — сценарий должен быть строго про это.

ГЛАВНЫЕ ПРАВИЛА И СТИЛЬ:
1. КАТЕГОРИЧЕСКИ БЕЗ ЭМОДЗИ И СМАЙЛИКОВ в текстах реплик и примерах.
2. НИКАКИХ ТОЧЕК В КОНЦЕ СООБЩЕНИЙ.
3. НИКАКИХ ДЛИННЫХ ТИРЕ (—).
4. Общение на «ты», как на живом форуме или в комментариях Telegram. Никакой канцелярщины, рекламы в лоб и роботоподобных фраз!
5. Режим: {'ДИНАМИЧЕСКИЙ (боты генерируют фразы на лету по точечным промптам)' if mode == 'dynamic' else 'СТАТИЧЕСКИЙ (готовые фиксированные реплики)'}.

КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ К ПОЛЮ "ai_prompt":
1. ЗАПРЕЩЕНО писать сухие инфинитивы типа "Начать разговор...", "Ответить скептически...".
2. КАЖДЫЙ "ai_prompt" должен быть ПОЛНОЦЕННОЙ ДИРЕКТИВНОЙ РОЛЕВОЙ ИНСТРУКЦИЕЙ ДЛЯ НЕЙРОСЕТИ, привязанной к теме пользователя.
Пример формата ai_prompt:
"Ты — {{Название роли}} (Роль {{Номер роли}}). {{Конкретная директива: начни тред по теме / ответь на шаг X / выскажи мнение по теме...}}. Пиши живо, на 'ты', 1-2 предложения, без эмодзи и без точки в конце."

ТРЕБОВАНИЕ К КОЛИЧЕСТВУ СООБЩЕНИЙ:
Массив "steps_payload" ОБЯЗАН содержать РОВНО {actual_steps_count} элементов (шагов)!
Если запрошено {actual_steps_count} сообщений, сгенерируй ровно {actual_steps_count} шагов (от step_order 1 до step_order {actual_steps_count}), распределяя роли {roles_count} ботов по цепочке.

Формат ответа: СТРОГО валидный JSON-объект."""

    user_instructions = f"""
Тема и задумка пользователя:
"{topic}"

ПАРАМЕТРЫ СЦЕНЫ:
- Драматургия: {drama_desc}
- Тональность: {tone_desc}
- Количество ботов (ролей): {roles_count}
- Количество сообщений (шагов диалога): {actual_steps_count} (ОБЯЗАТЕЛЬНО СГЕНЕРИРУЙ РОВНО {actual_steps_count} ШАГОВ В steps_payload!)
- Режим: {'Динамический (is_ai_dynamic=true)' if mode == 'dynamic' else 'Статический (is_ai_dynamic=false)'}

СТРУКТУРА JSON:
{{
  "title": "Ёмкое и понятное название диалога",
  "category": "software",
  "mode": "{mode}",
  "prompt_text": "Развернутый общий промпт сценария для ИИ, описывающий контекст поста, драматургию обсуждения и ключевой посыл",
  "roles": [
    {{
      "role_order": 1,
      "role_name": "Новичок / Зачинщик",
      "goal": "Задать боль или вопрос в комментариях",
      "instruction": "Ты — Новичок. Начинаешь тред под постом, задаешь вопрос по теме...",
      "sample_text": "Пример фразы без точки на конце и без эмодзи"
    }}
  ],
  "steps_payload": [
    // ВНИМАНИЕ: Сгенерируй здесь РОВНО {actual_steps_count} элементов с step_order от 1 до {actual_steps_count}!
    {{
      "step_order": 1,
      "role_id": 1,
      "role_name": "Новичок / Зачинщик",
      "text": "Пример реалистичной живой реплики без точки на конце",
      "ai_prompt": "Ты — Новичок (Роль 1). Начни тред в комментариях под постом от первого лица... Пиши на 'ты', без эмодзи и без точки в конце",
      "is_ai_dynamic": {str(mode == 'dynamic').lower()},
      "reply_to_step": null,
      "delay_before_min": 4.0,
      "delay_before_max": 8.0,
      "reactions": null,
      "reaction_count": 0
    }}
  ]
}}"""

    raw_response = await call_ai_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_instructions,
        json_mode=True,
        base_url=settings.get("base_url"),
        max_tokens=3500,
        temperature=0.94
    )

    data = robust_json_loads(raw_response)
    if not isinstance(data, dict):
        raise ValueError("Invalid structure received from AI Prompt Studio")

    # Ensure roles list is valid
    roles = data.get("roles")
    if not isinstance(roles, list) or len(roles) == 0:
        roles = [
            {
                "role_order": i + 1,
                "role_name": f"Участник #{i + 1}",
                "goal": "Поддержать живой диалог",
                "instruction": f"Ты — Участник #{i + 1}. Веди естественную беседу на 'ты' без эмодзи.",
                "sample_text": f"Интересно, как сейчас это устроено"
            }
            for i in range(roles_count)
        ]
        data["roles"] = roles

    # Sanitize roles
    for role in roles:
        if isinstance(role, dict) and "sample_text" in role:
            role["sample_text"] = sanitize_telegram_comment(role["sample_text"])

    # Ensure steps_payload has EXACTLY actual_steps_count steps
    raw_steps = data.get("steps_payload")
    if not isinstance(raw_steps, list):
        raw_steps = []

    steps_payload: List[Dict[str, Any]] = []
    num_roles = max(len(roles), 1)

    for idx in range(actual_steps_count):
        role_order = (idx % num_roles) + 1
        role_obj = next((r for r in roles if r.get("role_order") == role_order), roles[role_order - 1 if role_order - 1 < len(roles) else 0])
        role_name = role_obj.get("role_name") or f"Бот #{role_order}"

        if idx < len(raw_steps) and isinstance(raw_steps[idx], dict):
            step = raw_steps[idx]
            step["step_order"] = idx + 1
            step["role_id"] = step.get("role_id") or role_order
            step["role_name"] = role_name
            if mode == "dynamic":
                step["is_ai_dynamic"] = True
                if not step.get("ai_prompt") or len(str(step.get("ai_prompt")).strip()) < 10:
                    step["ai_prompt"] = f"Ты — {role_name} (Роль {role_order}). Ответь на предыдущую реплику (Шаг #{idx}). Развей мысль по теме, пиши на 'ты' живо, без эмодзи и без точки в конце."
            else:
                step["is_ai_dynamic"] = False
                step["ai_prompt"] = None
            if idx > 0 and step.get("reply_to_step") is None:
                step["reply_to_step"] = idx
            if "text" in step:
                step["text"] = sanitize_telegram_comment(str(step["text"]))
            if "sample_text" in step:
                step["sample_text"] = sanitize_telegram_comment(str(step["sample_text"]))
            steps_payload.append(step)
        else:
            # Generate missing step algorithmically
            prev_step_num = idx
            if idx == 0:
                ai_prompt_text = f"Ты — {role_name} (Роль {role_order}). Начни живое обсуждение под постом от первого лица: задай открытый вопрос по теме. Пиши просто на 'ты', 1-2 предложения, без эмодзи и без точки в конце."
                sample = role_obj.get("sample_text") or "Кто в курсе, как сейчас лучше это делать"
                reply_target = None
            elif idx == 1:
                ai_prompt_text = f"Ты — {role_name} (Роль {role_order}). Ответь на сообщение из Шага #1. Посоветуй проверенное решение или поделись опытом. Пиши уверенно и просто на 'ты', без рекламы, без эмодзи и без точки в конце."
                sample = role_obj.get("sample_text") or "Тут главное не спешить и делать всё по шагам"
                reply_target = 1
            elif idx == 2:
                ai_prompt_text = f"Ты — {role_name} (Роль {role_order}). Вклинись в тред (Шаг #2). Вырази легкое сомнение или задай уточняющий вопрос по рискам и затратам. Пиши лаконично на 'ты', без эмодзи и без точки в конце."
                sample = "А по затратам как выходит, окупается вообще"
                reply_target = 2
            elif idx == actual_steps_count - 1:
                ai_prompt_text = f"Ты — {role_name} (Роль {role_order}). Подведи позитивный итог дискуссии (Шаг #{prev_step_num}), поблагодари за совет. Пиши лаконично, без эмодзи и без точки в конце."
                sample = "Понял, спасибо за наводку, попробую на днях"
                reply_target = prev_step_num
            else:
                ai_prompt_text = f"Ты — {role_name} (Роль {role_order}). Ответь на реплику из Шага #{prev_step_num}. Добавь важный нюанс или аргумент из практики. Пиши живо на 'ты', без эмодзи и без точки в конце."
                sample = "Да, там еще важно учитывать текущие комиссии"
                reply_target = prev_step_num

            steps_payload.append({
                "step_order": idx + 1,
                "role_id": role_order,
                "role_name": role_name,
                "text": sanitize_telegram_comment(sample),
                "sample_text": sanitize_telegram_comment(sample),
                "ai_prompt": ai_prompt_text if mode == "dynamic" else None,
                "is_ai_dynamic": mode == "dynamic",
                "reply_to_step": reply_target,
                "delay_before_min": 4.0,
                "delay_before_max": 9.0,
                "reactions": "👍" if idx == actual_steps_count - 1 else None,
                "reaction_count": 1 if idx == actual_steps_count - 1 else 0
            })

    data["steps_payload"] = steps_payload
    return data

