import os
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Account, Proxy

logger = logging.getLogger(__name__)

async def bind_proxy_to_account(session: AsyncSession, account_id: int, proxy_id: int) -> bool:
    """
    Binds a proxy to an account (1:1 Sticky Session).
    Returns True if successful, False if the proxy is already assigned to another active account
    or if the account/proxy does not exist.
    """
    account_stmt = select(Account).where(Account.id == account_id)
    account_result = await session.execute(account_stmt)
    account = account_result.scalar_one_or_none()
    
    if not account:
        logger.error(f"Account {account_id} not found.")
        return False
        
    proxy_stmt = select(Proxy).where(Proxy.id == proxy_id)
    proxy_result = await session.execute(proxy_stmt)
    proxy = proxy_result.scalar_one_or_none()
    
    if not proxy:
        logger.error(f"Proxy {proxy_id} not found.")
        return False

    # Check if proxy is already used by another active account
    # In a strict 1:1, a proxy can only be bound to one account at a time.
    conflict_stmt = select(Account).where(Account.proxy_id == proxy_id, Account.id != account_id)
    conflict_result = await session.execute(conflict_stmt)
    conflict_account = conflict_result.scalar_one_or_none()
    
    if conflict_account:
        logger.warning(f"Proxy {proxy_id} is already bound to Account {conflict_account.id}.")
        return False
        
    account.proxy_id = proxy.id
    
    # If the account was unassigned_proxy, and we are now assigning one, it can become active again.
    if account.status == "unassigned_proxy":
        account.status = "active"
        
    await session.commit()
    logger.info(f"Successfully bound Proxy {proxy_id} to Account {account_id}.")
    return True

async def validate_account_proxy_mode(session: AsyncSession, account_id: int) -> bool:
    """
    Evaluates the USE_PROXY mode selector.
    
    USE_PROXY=True (Default Safe Mode):
        Account must have a bound active proxy. If not, status changes to 'unassigned_proxy',
        execution is forbidden (returns False).
        
    USE_PROXY=False (Danger Mode):
        Emits a critical warning to the logs.
        Allows execution from the server's local IP (returns True).
    """
    use_proxy = os.getenv("USE_PROXY", "True").lower() in ("true", "1", "yes")
    
    account_stmt = select(Account).where(Account.id == account_id)
    account_result = await session.execute(account_stmt)
    account = account_result.scalar_one_or_none()
    
    if not account:
        logger.error(f"Account {account_id} not found during validation.")
        return False

    if not use_proxy:
        logger.warning("CRITICAL WARNING: PROXY DISABLED. High risk of immediate ban by Telegram Anti-Spam algorithms!")
        return True
        
    # Safe Mode (USE_PROXY=True)
    if account.proxy_id is None:
        if account.status != "unassigned_proxy":
            account.status = "unassigned_proxy"
            await session.commit()
        logger.error(f"Account {account_id} has no proxy assigned in Safe Mode. Execution forbidden.")
        return False
        
    proxy_stmt = select(Proxy).where(Proxy.id == account.proxy_id)
    proxy_result = await session.execute(proxy_stmt)
    proxy = proxy_result.scalar_one_or_none()
    
    if not proxy or proxy.status != "active":
        if account.status != "unassigned_proxy":
            account.status = "unassigned_proxy"
            await session.commit()
        logger.error(f"Account {account_id} has a dead or missing proxy in Safe Mode. Execution forbidden.")
        return False
        
    return True
