import asyncio
import time
import socket
import logging
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import SystemConfig, Account, Proxy

logger = logging.getLogger("tgactor.proxy")

try:
    import socks
    HAS_SOCKS = True
except ImportError:
    HAS_SOCKS = False

def _test_proxy_sync(host: str, port: int, protocol: str = "socks5", username: Optional[str] = None, password: Optional[str] = None, timeout: float = 6.0) -> Dict[str, Any]:
    if not HAS_SOCKS:
        return {"status": "error", "error": "PySocks is not installed in the environment"}

    s = socks.socksocket()
    s.settimeout(timeout)

    proto = (protocol or "socks5").strip().lower()
    if proto in ["socks4", "socks4a"]:
        p_type = socks.SOCKS4
    elif proto in ["http", "https"]:
        p_type = socks.HTTP
    else:
        p_type = socks.SOCKS5

    user = username.strip() if username else None
    pwd = password.strip() if password else None

    try:
        s.set_proxy(p_type, host.strip(), int(port), username=user, password=pwd)
        t0 = time.time()
        # Test connection directly to Telegram DC2
        s.connect(("149.154.167.50", 443))
        latency = int((time.time() - t0) * 1000)
        s.close()
        return {
            "status": "ok",
            "latency_ms": latency,
            "target": "Telegram DC2 (149.154.167.50:443)",
            "protocol": proto
        }
    except Exception as e:
        err_msg = str(e)
        if "timed out" in err_msg.lower() or "timeout" in err_msg.lower():
            err_msg = f"Таймаут соединения ({timeout}с)"
        elif "connection refused" in err_msg.lower():
            err_msg = "В соединении отказано (Connection refused)"
        elif "authentication" in err_msg.lower() or "auth" in err_msg.lower():
            err_msg = "Ошибка авторизации прокси (неверный логин/пароль)"
        return {
            "status": "error",
            "error": err_msg,
            "protocol": proto
        }

async def check_proxy_connectivity(proxy: Proxy, timeout: float = 6.0) -> Dict[str, Any]:
    """Asynchronously check if proxy can reach Telegram infrastructure."""
    return await asyncio.to_thread(
        _test_proxy_sync,
        host=proxy.host,
        port=proxy.port,
        protocol=proxy.protocol or "socks5",
        username=proxy.username,
        password=proxy.password,
        timeout=timeout
    )

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
