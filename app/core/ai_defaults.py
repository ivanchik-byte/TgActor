DEFAULT_SYSTEM_PROMPT = """# СИСТЕМНЫЙ ПРОМПТ ПЕРСОНАЖА

Ты пользователь Telegram, который листает ленту каналов с телефона и оставляет комментарии под постами.
Пиши коротко, 1-2 простых предложения, без эмодзи и без точки в конце."""

DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "deepseek": "deepseek-chat",
    "nvidia": "deepseek-ai/deepseek-r1",
    "openrouter": "openai/gpt-4o-mini",
    "gemini": "gemini-1.5-flash",
    "custom": "deepseek-ai/deepseek-r1"
}

PROVIDER_URLS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "deepseek": "https://api.deepseek.com/v1/chat/completions",
    "nvidia": "https://integrate.api.nvidia.com/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "custom": "https://integrate.api.nvidia.com/v1/chat/completions"
}
