from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
import tempfile
import os

from app.core.database import async_session
from app.models.models import Account, Proxy
from app.models.schemas import (
    AccountCreate, AccountResponse, AccountCustomNameUpdate, 
    AccountReorderRequest, AccountProxyUpdate, AccountPoolsUpdate
)
from app.telegram.tdata_converter import convert_tdata_zip_to_encrypted_session
from app.telegram.client import get_hydrogram_client
from app.services.inbox_service import sync_dialogs_for_account

router = APIRouter()

@router.get("/api/accounts")
async def get_accounts():
    async with async_session() as session:
        result = await session.execute(select(Account).order_by(Account.position.asc(), Account.id.asc()))
        accounts = result.scalars().all()
        return [
            {
                "id": a.id,
                "phone": a.phone,
                "is_active": a.is_active,
                "first_name": a.first_name,
                "last_name": a.last_name,
                "username": a.username,
                "custom_name": a.custom_name,
                "status": a.status or "active",
                "source_type": a.source_type or "tdata",
                "position": a.position or 0,
                "pool_type": a.pool_type or "commenting",
                "in_commenting_pool": (a.pool_type or "commenting").lower() in ["commenting", "both"],
                "in_reaction_pool": (a.pool_type or "").lower() in ["reactions", "reaction", "both"],
                "proxy_id": a.proxy_id
            }
            for a in accounts
        ]

@router.post("/api/accounts")
async def create_account(acc: AccountCreate):
    async with async_session() as session:
        account = Account(**acc.model_dump())
        session.add(account)
        await session.commit()
        return {"status": "ok", "id": account.id}

@router.post("/api/accounts/upload-tdata")
@router.post("/api/accounts/import-tdata")
async def upload_tdata(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    phone: Optional[str] = Form(None),
    password: Optional[str] = Form(None)
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    success, session_or_error, user_info = await convert_tdata_zip_to_encrypted_session(tmp_path, password)
    
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    if not success or not user_info:
        raise HTTPException(400, detail=session_or_error)

    acc_phone = phone or user_info.get("phone")
    if not acc_phone:
        raise HTTPException(400, detail="Could not determine phone number from tdata.")

    async with async_session() as session:
        # Check if account already exists with this phone
        existing_acc = await session.execute(select(Account).where(Account.phone == acc_phone))
        existing = existing_acc.scalars().first()
        if existing:
            existing.session_string = session_or_error
            existing.is_active = True
            existing.status = "active"
            if user_info.get("first_name"):
                existing.first_name = user_info.get("first_name")
            if user_info.get("last_name"):
                existing.last_name = user_info.get("last_name")
            if user_info.get("username"):
                existing.username = user_info.get("username")
            await session.commit()
            background_tasks.add_task(sync_dialogs_for_account, existing.id)
            return {"status": "ok", "id": existing.id, "message": "Account updated"}
        else:
            acc = Account(
                phone=acc_phone,
                session_string=session_or_error,
                first_name=user_info.get("first_name"),
                last_name=user_info.get("last_name"),
                username=user_info.get("username"),
                is_active=True,
                status="active",
                source_type="tdata",
                pool_type="commenting"
            )
            session.add(acc)
            await session.commit()
            background_tasks.add_task(sync_dialogs_for_account, acc.id)
            return {"status": "ok", "id": acc.id}

@router.api_route("/api/accounts/{account_id}/test", methods=["GET", "POST"])
async def test_account(account_id: int):
    """
    Test Telegram connection for a specific account.
    Connects via Hydrogram client, calls get_me(), updates status and info, returns status result.
    """
    async with async_session() as session:
        account = await session.get(Account, account_id)
        if not account:
            raise HTTPException(404, detail=f"Аккаунт #{account_id} не найден")
        
        proxy = None
        if account.proxy_id:
            proxy = await session.get(Proxy, account.proxy_id)

    client = get_hydrogram_client(account, proxy)
    try:
        await client.start()
        me = await client.get_me()
        
        async with async_session() as session:
            db_acc = await session.get(Account, account_id)
            if db_acc:
                db_acc.is_active = True
                db_acc.status = "active"
                if me.first_name:
                    db_acc.first_name = me.first_name
                if me.last_name:
                    db_acc.last_name = me.last_name
                if me.username:
                    db_acc.username = me.username
                await session.commit()
                
        name_str = me.first_name or me.phone
        username_str = f" (@{me.username})" if me.username else ""
        return {
            "status": "ok",
            "message": f"Соединение с Telegram успешно! Аккаунт: {name_str}{username_str}"
        }
    except Exception as e:
        async with async_session() as session:
            db_acc = await session.get(Account, account_id)
            if db_acc:
                db_acc.is_active = False
                db_acc.status = "error"
                await session.commit()
        return {
            "status": "error",
            "message": f"Ошибка соединения: {str(e)}"
        }
    finally:
        try:
            await client.stop()
        except Exception:
            pass

@router.patch("/api/accounts/{account_id}/name")
async def update_account_custom_name(account_id: int, payload: AccountCustomNameUpdate):
    """Update custom alias / name for an account."""
    async with async_session() as session:
        acc = await session.get(Account, account_id)
        if not acc:
            raise HTTPException(404, detail="Account not found")
        acc.custom_name = payload.custom_name
        await session.commit()
        return {"status": "ok", "custom_name": acc.custom_name}

@router.post("/api/accounts/reorder")
async def reorder_accounts(payload: AccountReorderRequest):
    """Update account order positions."""
    async with async_session() as session:
        for idx, acc_id in enumerate(payload.ids):
            acc = await session.get(Account, acc_id)
            if acc:
                acc.position = idx
        await session.commit()
        return {"status": "ok"}

@router.patch("/api/accounts/{account_id}/proxy")
async def update_account_proxy(account_id: int, payload: AccountProxyUpdate):
    """Bind or unbind proxy to an account."""
    async with async_session() as session:
        acc = await session.get(Account, account_id)
        if not acc:
            raise HTTPException(404, detail="Account not found")
        acc.proxy_id = payload.proxy_id
        await session.commit()
        return {"status": "ok", "proxy_id": acc.proxy_id}

@router.patch("/api/accounts/{account_id}/pools")
async def update_account_pools(account_id: int, payload: AccountPoolsUpdate):
    """Update account pool type (commenting / reaction)."""
    async with async_session() as session:
        acc = await session.get(Account, account_id)
        if not acc:
            raise HTTPException(404, detail="Account not found")

        curr_p = (acc.pool_type or "commenting").lower()
        curr_comment = curr_p in ["commenting", "both"]
        curr_react = curr_p in ["reactions", "reaction", "both"]

        new_comment = payload.in_commenting_pool if payload.in_commenting_pool is not None else curr_comment
        new_react = payload.in_reaction_pool if payload.in_reaction_pool is not None else curr_react

        if payload.pool_type:
            acc.pool_type = payload.pool_type
        else:
            if new_comment and new_react:
                acc.pool_type = "both"
            elif new_comment:
                acc.pool_type = "commenting"
            elif new_react:
                acc.pool_type = "reactions"
            else:
                acc.pool_type = "none"

        await session.commit()
        return {
            "status": "ok",
            "pool_type": acc.pool_type,
            "in_commenting_pool": acc.pool_type in ["commenting", "both"],
            "in_reaction_pool": acc.pool_type in ["reactions", "reaction", "both"]
        }

@router.delete("/api/accounts/{account_id}")
async def delete_account(account_id: int):
    async with async_session() as session:
        acc = await session.get(Account, account_id)
        if not acc:
            raise HTTPException(404, detail="Account not found")
        await session.delete(acc)
        await session.commit()
        return {"status": "ok"}

@router.get("/api/accounts/{account_id}/admin-channels")
async def get_account_admin_channels(account_id: int):
    """Retrieve channels where the account is creator or administrator with permission to post."""
    async with async_session() as session:
        acc = await session.get(Account, account_id)
        if not acc:
            raise HTTPException(404, detail="Account not found")

        client = get_hydrogram_client(acc, getattr(acc, "proxy", None))
        channels_list = []
        try:
            await client.start()
            async for dialog in client.get_dialogs(limit=100):
                chat = dialog.chat
                chat_type = str(getattr(chat, "type", "")).lower()
                is_creator = getattr(chat, "is_creator", False)
                
                # Check if it is a channel or supergroup
                if "channel" in chat_type or is_creator:
                    channels_list.append({
                        "id": chat.id,
                        "title": getattr(chat, "title", "Канал"),
                        "username": getattr(chat, "username", None) or "",
                        "is_creator": is_creator,
                        "type": chat_type
                    })
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Error fetching admin channels for account #{account_id}: {e}")
        finally:
            try:
                await client.stop()
            except Exception:
                pass

        return channels_list
