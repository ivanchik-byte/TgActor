from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.security import check_password, generate_auth_token

router = APIRouter()

class LoginRequest(BaseModel):
    password: str

@router.post("/api/auth/login")
async def login(req: LoginRequest):
    if not check_password(req.password):
        raise HTTPException(401, detail="Неверный пароль администратора")
    token = generate_auth_token(req.password)
    return {"access_token": token, "token_type": "bearer"}
