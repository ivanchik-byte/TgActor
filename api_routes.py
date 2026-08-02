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
    if req.password != os.environ.get("ADMIN_PASSWORD", "admin"):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    token = jwt.encode(
        {"sub": "admin", "exp": datetime.utcnow() + timedelta(hours=24)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
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
        result = await session.execute(select(Account))
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

from pydantic import BaseModel

class PhoneAuthRequest(BaseModel):
    phone: str
    api_id: str
    api_hash: str

class PhoneSignInRequest(BaseModel):
    phone: str
    phone_code_hash: str
    code: str

@router.post("/api/accounts/send-code")
async def send_phone_code(req: PhoneAuthRequest):
    # Mock implementation for UI flow
    import asyncio
    await asyncio.sleep(1)
    return {"ok": True, "phone_code_hash": "mock_hash_12345"}

@router.post("/api/accounts/sign-in")
async def sign_in_phone(req: PhoneSignInRequest):
    # Mock implementation for UI flow
    import asyncio
    from models import Account
    import datetime
    
    await asyncio.sleep(1)
    
    async with async_session() as session:
        # Create mock account
        new_acc = Account(
            phone=req.phone,
            status="active",
            source_type="phone",
            encrypted_session=b"mock_session",
            created_at=datetime.datetime.utcnow()
        )
        session.add(new_acc)
        await session.commit()
        return {"ok": True, "account_id": new_acc.id}

@router.post("/api/accounts/upload-tdata")
async def upload_tdata(file: UploadFile = File(...)):
    # This is a stub for opentele conversion logic.
    return {"status": "uploaded", "filename": file.filename}

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
    min_delay: float = 2.0
    max_delay: float = 5.0

@router.get("/api/scenarios")
async def get_scenarios():
    async with async_session() as session:
        result = await session.execute(select(Scenario))
        return result.scalars().all()

@router.post("/api/scenarios")
async def create_scenario(sc: ScenarioCreate):
    async with async_session() as session:
        scenario = Scenario(**sc.model_dump())
        session.add(scenario)
        await session.commit()
        return {"status": "ok", "id": scenario.id}

class ScenarioStepCreate(BaseModel):
    scenario_id: int
    step_order: int
    role_id: int
    message_type: str
    text: Optional[str] = None
    media_path: Optional[str] = None
    reply_to_step_id: Optional[int] = None
    reactions: Optional[str] = None
    reaction_count: Optional[int] = None

@router.post("/api/scenarios/steps")
async def create_scenario_step(step: ScenarioStepCreate):
    async with async_session() as session:
        s_step = ScenarioStep(**step.model_dump())
        session.add(s_step)
        await session.commit()
        return {"status": "ok", "id": s_step.id}

@router.get("/api/scenarios/{scenario_id}/steps")
async def get_scenario_steps(scenario_id: int):
    async with async_session() as session:
        stmt = select(ScenarioStep).where(ScenarioStep.scenario_id == scenario_id).order_by(ScenarioStep.step_order)
        result = await session.execute(stmt)
        return result.scalars().all()

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
            SELECT DISTINCT ON (account_id, peer_id) 
                account_id, peer_id, sender_username, text, received_at, is_incoming
            FROM inbox_messages 
            ORDER BY account_id, peer_id, received_at DESC
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
                "is_incoming": row[5]
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
    async with async_session() as session:
        account = await session.get(Account, account_id)
        if account:
            await session.delete(account)
            await session.commit()
        return {"status": "deleted"}
