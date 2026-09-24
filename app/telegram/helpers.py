from contextlib import asynccontextmanager


def is_broadcast_channel(chat) -> bool:
    chat_type = getattr(chat, "type", "")
    text = str(chat_type).lower()
    return chat_type == "channel" or text.endswith("channel") or getattr(chat_type, "value", "") == "channel"


def account_label(acc) -> str:
    if getattr(acc, "custom_name", None):
        return acc.custom_name
    if getattr(acc, "username", None):
        return f"@{acc.username}"
    return getattr(acc, "first_name", None) or f"Бот #{acc.id}"


def chat_key(target) -> str:
    return str(target).strip().lower().replace('@', '').split('/')[-1]


@asynccontextmanager
async def managed_client(account, proxy=None):
    from app.telegram.client import get_hydrogram_client
    client = get_hydrogram_client(account, proxy if proxy is not None else getattr(account, "proxy", None))
    try:
        await client.start()
        yield client
    finally:
        try:
            await client.stop()
        except Exception:
            pass
