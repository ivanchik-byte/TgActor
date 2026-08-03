import os
import jwt
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from models import Account, Proxy, Scenario, ScenarioStep, SystemConfig, InboxMessage
from inbox_listener import async_session

router = APIRouter()

JWT_SECRET = os.environ.get("ADMIN_PASSWORD", "default_secret")
JWT_ALGORITHM = "HS256"

# -- Auth --
class LoginRequest(BaseModel):
    password: str

@router.post("/api/auth/login")
async def login(req: LoginRequest):
    import hmac
    import hashlib
    import time
    
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "1723")
    if not hmac.compare_digest(req.password.encode('utf-8'), admin_pwd.encode('utf-8')):
        time.sleep(1.0)
        raise HTTPException(status_code=401, detail="Неверный пароль администратора!")
        
    enc_key = os.environ.get("ENCRYPTION_KEY", "fallback")
    token = hmac.new(enc_key.encode(), admin_pwd.encode(), hashlib.sha256).hexdigest()
    return {"access_token": token, "token_type": "bearer"}

def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_admin(token: str = Depends(oauth2_scheme)):
    return verify_token(token)

# -- Accounts --
class PoolUpdateRequest(BaseModel):
    in_commenting_pool: bool
    in_reaction_pool: bool

@router.get("/api/accounts")
async def get_accounts():
    async with async_session() as session:
        result = await session.execute(select(Account).order_by(Account.id.asc()))
        return result.scalars().all()

@router.patch("/api/accounts/{account_id}/pools")
async def update_pools(account_id: int, req: PoolUpdateRequest):
    async with async_session() as session:
        acc = await session.get(Account, account_id)
        if not acc:
            raise HTTPException(404)
        acc.in_commenting_pool = req.in_commenting_pool
        acc.in_reaction_pool = req.in_reaction_pool
        await session.commit()
        return {"status": "ok"}

class AccountProxyUpdateRequest(BaseModel):
    proxy_id: Optional[int] = None

@router.patch("/api/accounts/{account_id}/proxy")
async def update_account_proxy(account_id: int, req: AccountProxyUpdateRequest):
    async with async_session() as session:
        acc = await session.get(Account, account_id)
        if not acc:
            raise HTTPException(404, "Account not found")
        acc.proxy_id = req.proxy_id
        await session.commit()
        
        from inbox_listener import stop_account_listener, start_account_listener
        from sqlalchemy.orm import selectinload
        
        await stop_account_listener(account_id)
        
        stmt = select(Account).options(selectinload(Account.proxy)).where(Account.id == account_id)
        acc_with_proxy = (await session.execute(stmt)).scalar_one()
        if acc_with_proxy.status == "active":
            await start_account_listener(acc_with_proxy)
            
        return {"status": "ok"}

from pydantic import BaseModel

class PhoneAuthRequest(BaseModel):
    phone: str
    api_id: str
    api_hash: str

class PhoneSignInRequest(BaseModel):
    phone: str
    phone_code_hash: str
    code: str
    password: Optional[str] = None

# Global store for active login sessions
auth_clients = {}

@router.post("/api/accounts/send-code")
async def send_phone_code(req: PhoneAuthRequest):
    import logging
    from hydrogram import Client
    from hydrogram.errors import FloodWait, PhoneNumberInvalid, ApiIdInvalid
    
    phone = req.phone.strip().replace(" ", "").replace("-", "")
    try:
        api_id = int(req.api_id.strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="API ID должен быть числом.")
        
    api_hash = req.api_hash.strip()
    
    if phone in auth_clients:
        try:
            await auth_clients[phone]["client"].disconnect()
        except Exception:
            pass
        del auth_clients[phone]
        
    client = Client(
        name=phone,
        api_id=api_id,
        api_hash=api_hash,
        in_memory=True
    )
    
    try:
        await client.connect()
        sent_code = await client.send_code(phone)
        
        auth_clients[phone] = {
            "client": client,
            "api_id": api_id,
            "api_hash": api_hash,
            "phone_code_hash": sent_code.phone_code_hash
        }
        return {"ok": True, "phone_code_hash": sent_code.phone_code_hash}
        
    except FloodWait as e:
        raise HTTPException(status_code=400, detail=f"Лимит запросов превышен. Попробуйте через {e.value} сек.")
    except PhoneNumberInvalid:
        raise HTTPException(status_code=400, detail="Неверный номер телефона.")
    except ApiIdInvalid:
        raise HTTPException(status_code=400, detail="Неверные api_id или api_hash.")
    except Exception as e:
        logging.getLogger(__name__).error(f"Error in send_code: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка Telegram: {str(e)}")

@router.post("/api/accounts/sign-in")
async def sign_in_phone(req: PhoneSignInRequest):
    import datetime
    from models import Account, Proxy
    from security import encrypt_session
    from hydrogram.errors import SessionPasswordNeeded, PhoneCodeInvalid, PhoneCodeExpired
    
    phone = req.phone.strip().replace(" ", "").replace("-", "")
    
    if phone not in auth_clients:
        raise HTTPException(status_code=400, detail="Сессия не найдена. Запросите код заново.")
        
    auth_data = auth_clients[phone]
    client = auth_data["client"]
    phone_code_hash = auth_data["phone_code_hash"]
    
    try:
        if req.password:
            # Complete login with 2FA password
            await client.check_password(req.password)
        else:
            await client.sign_in(phone, phone_code_hash, req.code)
            
        session_string = await client.export_session_string()
        me = await client.get_me()
        
        await client.disconnect()
        del auth_clients[phone]
        
        encrypted_session = encrypt_session(session_string)
        
        async with async_session() as session:
            # Find free proxy
            stmt = select(Proxy).where(~Proxy.id.in_(
                select(Account.proxy_id).where(Account.proxy_id != None)
            )).limit(1)
            proxy_res = await session.execute(stmt)
            free_proxy = proxy_res.scalar_one_or_none()
            proxy_id = free_proxy.id if free_proxy else None
            
            new_acc = Account(
                phone=phone,
                telegram_id=me.id,
                first_name=me.first_name,
                last_name=me.last_name,
                username=me.username,
                encrypted_session=encrypted_session,
                proxy_id=proxy_id,
                status="active",
                source_type="phone",
                created_at=datetime.datetime.utcnow()
            )
            session.add(new_acc)
            await session.commit()
            
            # Start background listener for the new account
            from inbox_listener import start_account_listener
            from sqlalchemy.orm import selectinload
            stmt = select(Account).options(selectinload(Account.proxy)).where(Account.id == new_acc.id)
            acc_with_proxy = (await session.execute(stmt)).scalar_one()
            await start_account_listener(acc_with_proxy)
            
            return {"ok": True, "account_id": new_acc.id}
            
    except SessionPasswordNeeded:
        return {"ok": False, "need_password": True}
    except PhoneCodeInvalid:
        raise HTTPException(status_code=400, detail="Неверный код подтверждения.")
    except PhoneCodeExpired:
        raise HTTPException(status_code=400, detail="Код подтверждения истек.")
    except Exception as e:
        try:
            await client.disconnect()
        except Exception:
            pass
        if phone in auth_clients:
            del auth_clients[phone]
        raise HTTPException(status_code=500, detail=f"Ошибка авторизации: {str(e)}")

@router.post("/api/accounts/upload-tdata")
async def upload_tdata(file: UploadFile = File(...)):
    import tempfile
    import shutil
    import logging
    import datetime
    from tdata_converter import convert_tdata_zip_to_encrypted_session
    from models import Account, Proxy
    from security import decrypt_session
    from hydrogram import Client
    from inbox_listener import start_account_listener
    from sqlalchemy.orm import selectinload
    
    # Save upload to a temp zip file
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        temp_path = temp_file.name
        
    try:
        success, encrypted_session = await convert_tdata_zip_to_encrypted_session(temp_path)
        if not success:
            raise HTTPException(status_code=400, detail="Неверный или поврежденный tdata-архив.")
            
        session_string = decrypt_session(encrypted_session)
        
        # Test client to fetch profile details
        client = Client(
            name="temp_tdata_check",
            session_string=session_string,
            in_memory=True
        )
        await client.connect()
        me = await client.get_me()
        await client.disconnect()
        
        async with async_session() as session:
            # Find free proxy
            stmt = select(Proxy).where(~Proxy.id.in_(
                select(Account.proxy_id).where(Account.proxy_id != None)
            )).limit(1)
            proxy_res = await session.execute(stmt)
            free_proxy = proxy_res.scalar_one_or_none()
            proxy_id = free_proxy.id if free_proxy else None
            
            new_acc = Account(
                phone=me.phone_number,
                telegram_id=me.id,
                first_name=me.first_name,
                last_name=me.last_name,
                username=me.username,
                encrypted_session=encrypted_session,
                proxy_id=proxy_id,
                status="active",
                source_type="tdata",
                created_at=datetime.datetime.utcnow()
            )
            session.add(new_acc)
            await session.commit()
            
            # Start background listener for the new account
            stmt = select(Account).options(selectinload(Account.proxy)).where(Account.id == new_acc.id)
            acc_with_proxy = (await session.execute(stmt)).scalar_one()
            await start_account_listener(acc_with_proxy)
            
            return {"ok": True, "account_id": new_acc.id}
            
    except Exception as e:
        logging.getLogger(__name__).error(f"Error in upload_tdata: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка обработки tdata: {str(e)}")
    finally:
        import os
        if os.path.exists(temp_path):
            os.remove(temp_path)

# -- Proxies --
class ProxyCreate(BaseModel):
    ip: str
    port: int
    protocol: str = "socks5"
    username: Optional[str] = None
    password: Optional[str] = None

@router.get("/api/proxies")
async def get_proxies():
    async with async_session() as session:
        result = await session.execute(select(Proxy))
        return result.scalars().all()

@router.post("/api/proxies")
async def create_proxy(proxy: ProxyCreate):
    async with async_session() as session:
        new_proxy = Proxy(**proxy.model_dump())
        session.add(new_proxy)
        await session.commit()
        return {"status": "ok", "id": new_proxy.id}

@router.delete("/api/proxies/{proxy_id}")
async def delete_proxy(proxy_id: int):
    async with async_session() as session:
        proxy = await session.get(Proxy, proxy_id)
        if proxy:
            await session.delete(proxy)
            await session.commit()
        return {"status": "deleted"}

# -- Config (Proxy Mode) --
class ProxyModeRequest(BaseModel):
    use_proxy: bool

@router.post("/api/config/proxy-mode")
async def set_proxy_mode(req: ProxyModeRequest):
    async with async_session() as session:
        config = await session.get(SystemConfig, "USE_PROXY")
        val = "true" if req.use_proxy else "false"
        if not config:
            config = SystemConfig(key="USE_PROXY", value=val)
            session.add(config)
        else:
            config.value = val
        await session.commit()
        return {"status": "updated", "use_proxy": req.use_proxy}

@router.get("/api/config/proxy-mode")
async def get_proxy_mode():
    async with async_session() as session:
        config = await session.get(SystemConfig, "USE_PROXY")
        # default to True if not set
        return {"use_proxy": config.value == "true" if config else True}

# -- Scenarios --
class ScenarioCreate(BaseModel):
    title: str
    is_active: bool = False
    min_delay: float = 30.0
    max_delay: float = 60.0

class ScenarioUpdate(BaseModel):
    title: str
    is_active: bool
    min_delay: float
    max_delay: float

@router.get("/api/scenarios")
async def get_scenarios():
    async with async_session() as session:
        result = await session.execute(select(Scenario).order_by(Scenario.id.asc()))
        return result.scalars().all()

@router.post("/api/scenarios")
async def create_scenario(sc: ScenarioCreate):
    async with async_session() as session:
        scenario = Scenario(**sc.model_dump())
        session.add(scenario)
        await session.commit()
        return {"status": "ok", "id": scenario.id}

@router.put("/api/scenarios/{scenario_id}")
async def update_scenario(scenario_id: int, sc: ScenarioUpdate):
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, "Scenario not found")
        scenario.title = sc.title
        scenario.is_active = sc.is_active
        scenario.min_delay = sc.min_delay
        scenario.max_delay = sc.max_delay
        await session.commit()
        return {"status": "ok"}

@router.delete("/api/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: int):
    async with async_session() as session:
        scenario = await session.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(404, "Scenario not found")
        await session.execute(delete(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id))
        await session.delete(scenario)
        await session.commit()
        return {"status": "ok"}

class ScenarioStepBulkItem(BaseModel):
    step_order: int
    role_id: int
    message_type: str
    text: Optional[str] = None
    media_path: Optional[str] = None
    delay_before_min: Optional[float] = None
    delay_before_max: Optional[float] = None
    reactions: Optional[str] = None
    reaction_count: Optional[int] = None
    reply_to_index: Optional[int] = None

class ScenarioStepsBulkRequest(BaseModel):
    steps: List[ScenarioStepBulkItem]

@router.get("/api/scenarios/{scenario_id}/steps")
async def get_scenario_steps(scenario_id: int):
    async with async_session() as session:
        stmt = select(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id).order_by(ScenarioStep.step_order)
        result = await session.execute(stmt)
        return result.scalars().all()

@router.post("/api/scenarios/{scenario_id}/steps/bulk")
async def save_scenario_steps_bulk(scenario_id: int, req: ScenarioStepsBulkRequest):
    async with async_session() as session:
        # Delete old steps
        await session.execute(delete(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id))
        
        db_steps = []
        for item in req.steps:
            db_step = ScenarioStep(
                scenario_id=scenario_id,
                step_order=item.step_order,
                role_id=item.role_id,
                message_type=item.message_type,
                text=item.text,
                media_path=item.media_path,
                delay_before_min=item.delay_before_min,
                delay_before_max=item.delay_before_max,
                reactions=item.reactions,
                reaction_count=item.reaction_count,
                reply_to_step_id=None
            )
            session.add(db_step)
            db_steps.append(db_step)
            
        await session.flush()
        
        for idx, item in enumerate(req.steps):
            if item.reply_to_index is not None and 0 <= item.reply_to_index < len(db_steps):
                db_steps[idx].reply_to_step_id = db_steps[item.reply_to_index].id
                
        await session.commit()
        return {"status": "ok", "count": len(db_steps)}

from pydantic import BaseModel

class SendMessageRequest(BaseModel):
    account_id: int
    peer_id: int
    text: str

@router.get("/api/inbox/chats")
async def get_inbox_chats():
    async with async_session() as session:
        # Get latest message for each (account_id, peer_id)
        stmt = """
            SELECT DISTINCT ON (im.account_id, im.peer_id) 
                im.account_id, im.peer_id, im.sender_username, im.text, im.received_at, im.is_incoming, im.media_type, im.media_path,
                a.username, a.first_name, a.phone
            FROM inbox_messages im
            LEFT JOIN accounts a ON im.account_id = a.id
            ORDER BY im.account_id, im.peer_id, im.received_at DESC
        """
        from sqlalchemy import text
        result = await session.execute(text(stmt))
        chats = []
        for row in result:
            chats.append({
                "account_id": row[0],
                "peer_id": row[1],
                "sender_username": row[2],
                "last_message": row[3],
                "updated_at": row[4],
                "is_incoming": row[5],
                "media_type": row[6],
                "media_path": row[7],
                "account_username": row[8],
                "account_name": row[9],
                "account_phone": row[10]
            })
        
        # Sort all chats by updated_at globally
        chats.sort(key=lambda x: x["updated_at"], reverse=True)
        return chats

@router.get("/api/inbox/messages/{account_id}/{peer_id}")
async def get_chat_messages(account_id: int, peer_id: int, limit: int = 50):
    async with async_session() as session:
        stmt = select(InboxMessage).where(
            InboxMessage.account_id == account_id,
            InboxMessage.peer_id == peer_id
        ).order_by(InboxMessage.received_at.asc()).limit(limit)
        result = await session.execute(stmt)
        return result.scalars().all()

from inbox_listener import active_clients

@router.post("/api/inbox/download-media/{inbox_message_id}")
async def download_media_on_demand(inbox_message_id: int):
    async with async_session() as session:
        inbox_msg = await session.get(InboxMessage, inbox_message_id)
        if not inbox_msg:
            raise HTTPException(status_code=404, detail="Сообщение не найдено.")
            
        if inbox_msg.media_path:
            return {"media_path": inbox_msg.media_path}
            
        client = active_clients.get(inbox_msg.account_id)
        if not client:
            raise HTTPException(status_code=400, detail="Сессия аккаунта не активна.")
            
        try:
            tg_msg = await client.client.get_messages(chat_id=inbox_msg.peer_id, message_ids=inbox_msg.message_id)
            if not tg_msg or getattr(tg_msg, "empty", False):
                raise HTTPException(status_code=404, detail="Сообщение не найдено в Telegram (возможно, удалено).")
                
            from inbox_listener import save_media_if_exists
            media_type, media_path = await save_media_if_exists(client.client, tg_msg, force=True)
            
            if not media_path:
                raise HTTPException(status_code=500, detail="Не удалось скачать медиа-файл.")
                
            inbox_msg.media_path = media_path
            await session.commit()
            
            return {"media_path": media_path}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка скачивания: {str(e)}")

@router.post("/api/inbox/send")
async def send_inbox_message(req: SendMessageRequest):
    client = active_clients.get(req.account_id)
    if not client:
        return {"error": "Account is not active or client is offline"}, 400
    
    try:
        await client.send_message(req.peer_id, req.text)
        # Store in DB as outgoing
        async with async_session() as session:
            msg = InboxMessage(
                account_id=req.account_id,
                peer_id=req.peer_id,
                message_id=0, # outgoing, maybe unknown id if client wrapper doesn't return it immediately
                sender_username="Me",
                text=req.text,
                is_incoming=False
            )
            session.add(msg)
            await session.commit()
            
        return {"status": "sent"}
    except Exception as e:
        return {"error": str(e)}, 500

@router.delete("/api/accounts/{account_id}")
async def delete_account(account_id: int):
    from models import TaskLog, InboxMessage
    from inbox_listener import stop_account_listener
    # Stop background listener first
    await stop_account_listener(account_id)
    
    async with async_session() as session:
        account = await session.get(Account, account_id)
        if account:
            await session.execute(delete(TaskLog).where(TaskLog.account_id == account_id))
            await session.execute(delete(InboxMessage).where(InboxMessage.account_id == account_id))
            await session.delete(account)
            await session.commit()
        return {"status": "deleted"}

@router.post("/api/accounts/{account_id}/test")
async def test_account_connection(account_id: int):
    from inbox_listener import active_clients, start_account_listener
    from client import TelegramSessionClient
    from sqlalchemy.orm import selectinload
    
    async with async_session() as session:
        stmt = select(Account).options(selectinload(Account.proxy)).where(Account.id == account_id)
        res = await session.execute(stmt)
        account = res.scalar_one_or_none()
        if not account:
            raise HTTPException(404, "Account not found")
            
        client = active_clients.get(account_id)
        if client:
            try:
                me = await client.client.get_me()
                return {"status": "ok", "message": f"Соединение успешно установлено! Аккаунт: @{me.username or me.first_name}."}
            except Exception as e:
                account.status = "disconnected"
                await session.commit()
                return {"status": "error", "message": f"Ошибка соединения: {str(e)}"}
        else:
            proxy_dict = None
            if account.proxy:
                proxy_dict = {
                    "scheme": account.proxy.protocol,
                    "hostname": account.proxy.ip,
                    "port": account.proxy.port,
                }
                if account.proxy.username:
                    proxy_dict["username"] = account.proxy.username
                    proxy_dict["password"] = account.proxy.password
                    
            try:
                temp_client = TelegramSessionClient(encrypted_session=account.encrypted_session, proxy=proxy_dict)
                await temp_client.start()
                me = await temp_client.client.get_me()
                await temp_client.stop()
                
                account.status = "active"
                await session.commit()
                
                await start_account_listener(account)
                return {"status": "ok", "message": f"Соединение успешно установлено! Аккаунт: @{me.username or me.first_name}."}
            except Exception as e:
                account.status = "disconnected"
                await session.commit()
                return {"status": "error", "message": f"Не удалось подключиться: {str(e)}"}
