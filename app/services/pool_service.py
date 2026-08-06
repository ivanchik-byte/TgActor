from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.models.models import Account, SystemConfig

async def get_commenting_pool(session: AsyncSession) -> List[Account]:
    stmt = select(Account).where(Account.is_active == True, Account.pool_type == "commenting")
    result = await session.execute(stmt)
    return list(result.scalars().all())

async def get_reaction_pool(session: AsyncSession) -> List[Account]:
    stmt = select(Account).where(Account.is_active == True, Account.pool_type == "reactions")
    result = await session.execute(stmt)
    return list(result.scalars().all())
