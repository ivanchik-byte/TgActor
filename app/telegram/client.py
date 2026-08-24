from hydrogram import Client
from app.core.config import TELEGRAM_API_ID, TELEGRAM_API_HASH
from app.models.models import Account, Proxy
from app.core.security import decrypt_session

def get_hydrogram_client(account: Account, proxy: Proxy = None, api_id: int = None, api_hash: str = None) -> Client:
    api_id = api_id or TELEGRAM_API_ID
    api_hash = api_hash or TELEGRAM_API_HASH
    plain_session = decrypt_session(account.session_string)
    
    target_proxy = proxy
    if target_proxy is None:
        try:
            target_proxy = account.proxy
        except Exception:
            target_proxy = None

    proxy_dict = None
    if target_proxy:
        proxy_dict = {
            "scheme": getattr(target_proxy, 'protocol', None) or "socks5",
            "hostname": target_proxy.host,
            "port": target_proxy.port
        }
        if getattr(target_proxy, 'username', None):
            proxy_dict["username"] = target_proxy.username
        if getattr(target_proxy, 'password', None):
            proxy_dict["password"] = target_proxy.password

    client = Client(
        name=f"session_{account.id}",
        api_id=api_id,
        api_hash=api_hash,
        session_string=plain_session,
        proxy=proxy_dict,
        in_memory=True
    )
    return client
