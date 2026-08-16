from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from typing import List
from app.models.models import Account, SystemConfig

async def get_commenting_pool(session: AsyncSession) -> List[Account]:
    stmt = select(Account).options(selectinload(Account.proxy)).where(
        Account.is_active == True,
        or_(Account.pool_type.in_(["commenting", "both"]), Account.pool_type.is_(None))
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())

async def get_reaction_pool(session: AsyncSession) -> List[Account]:
    stmt = select(Account).options(selectinload(Account.proxy)).where(
        Account.is_active == True,
        or_(Account.pool_type.in_(["reactions", "both"]), Account.pool_type.is_(None))
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())
