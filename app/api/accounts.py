from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List

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

@router.post("/api/accounts/import-tdata")
async def import_tdata(
    file: UploadFile = File(...),
    phone: str = Form(...),
    password: Optional[str] = Form(None)
):
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    success, result = await convert_tdata_zip_to_encrypted_session(tmp_path, password)
    import os
    if os.path.exists(tmp_path):
        os.remove(tmp_path)

    if not success:
        raise HTTPException(400, detail=result)

    async with async_session() as session:
        acc = Account(phone=phone, session_string=result)
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
