from hydrogram import Client
from app.models.models import Account, Proxy
from app.core.security import decrypt_session

def get_hydrogram_client(account: Account, proxy: Proxy = None, api_id: int = 2040, api_hash: str = "b18441a1ed607415570faf839e64629b") -> Client:
    plain_session = decrypt_session(account.session_string)
    
    proxy_dict = None
    if proxy:
        proxy_dict = {
            "scheme": proxy.protocol or "socks5",
            "hostname": proxy.host,
            "port": proxy.port
        }
        if proxy.username:
            proxy_dict["username"] = proxy.username
        if proxy.password:
            proxy_dict["password"] = proxy.password

    client = Client(
        name=f"session_{account.id}",
        api_id=api_id,
        api_hash=api_hash,
        session_string=plain_session,
        proxy=proxy_dict,
        in_memory=True
    )
    return client
