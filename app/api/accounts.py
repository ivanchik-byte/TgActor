from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
import tempfile
import os

from app.core.database import async_session
from app.models.models import Account
from app.models.schemas import AccountCreate, AccountResponse
from app.telegram.tdata_converter import convert_tdata_zip_to_encrypted_session

router = APIRouter()

@router.get("/api/accounts", response_model=List[AccountResponse])
async def get_accounts():
    async with async_session() as session:
        result = await session.execute(select(Account).order_by(Account.id.asc()))
        return result.scalars().all()

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
            if user_info.get("first_name"):
                existing.first_name = user_info.get("first_name")
            if user_info.get("last_name"):
                existing.last_name = user_info.get("last_name")
            if user_info.get("username"):
                existing.username = user_info.get("username")
            await session.commit()
            return {"status": "ok", "id": existing.id, "message": "Account updated"}
        else:
            acc = Account(
                phone=acc_phone,
                session_string=session_or_error,
                first_name=user_info.get("first_name"),
                last_name=user_info.get("last_name"),
                username=user_info.get("username"),
                is_active=True,
                pool_type="commenting"
            )
            session.add(acc)
            await session.commit()
            return {"status": "ok", "id": acc.id}

@router.delete("/api/accounts/{account_id}")
async def delete_account(account_id: int):
    async with async_session() as session:
        acc = await session.get(Account, account_id)
        if not acc:
            raise HTTPException(404, "Account not found")
        await session.delete(acc)
        await session.commit()
        return {"status": "ok"}
