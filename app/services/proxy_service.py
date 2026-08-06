from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import SystemConfig, Account

async def is_proxy_required(session: AsyncSession) -> bool:
    config = await session.get(SystemConfig, "USE_PROXY")
    if not config:
        return True
    return config.value.lower() == "true"

async def validate_account_proxy_mode(session: AsyncSession, account: Account) -> tuple[bool, str]:
    required = await is_proxy_required(session)
    if required and not account.proxy_id:
        return False, f"Включен строгий режим USE_PROXY=true, но у аккаунта #{account.id} ({account.phone}) не привязан прокси."
    return True, ""
