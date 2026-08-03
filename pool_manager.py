import logging
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models import Account

logger = logging.getLogger(__name__)

async def get_commenting_pool(session: AsyncSession) -> List[Account]:
    """Returns active accounts assigned to the commenting pool."""
    stmt = select(Account).options(selectinload(Account.proxy)).where(
        Account.in_commenting_pool == True,
        Account.status == "active"
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())

async def get_reaction_pool(session: AsyncSession) -> List[Account]:
    """Returns active accounts assigned to the reaction pool."""
    stmt = select(Account).options(selectinload(Account.proxy)).where(
        Account.in_reaction_pool == True,
        Account.status == "active"
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())
