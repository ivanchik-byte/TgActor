from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from time import monotonic
from app.core.security import check_password, generate_auth_token

router = APIRouter()

class LoginRequest(BaseModel):
    password: str

_attempts: dict[str, list[float]] = {}
_WINDOW = 300.0
_MAX_ATTEMPTS = 5


def _throttled(key: str) -> bool:
    now = monotonic()
    hits = [t for t in _attempts.get(key, []) if now - t < _WINDOW]
    _attempts[key] = hits
    return len(hits) >= _MAX_ATTEMPTS


def _record_failed_attempt(key: str) -> None:
    _attempts.setdefault(key, []).append(monotonic())


def _reset_attempts(key: str) -> None:
    _attempts.pop(key, None)

@router.post("/api/auth/login")
async def login(req: LoginRequest, request: Request):
    client_key = request.client.host if request.client else "unknown"
    if _throttled(client_key):
        raise HTTPException(429, detail="Too many attempts")
    if not check_password(req.password):
        _record_failed_attempt(client_key)
        raise HTTPException(401, detail="Неверный пароль администратора")
    _reset_attempts(client_key)
    token = generate_auth_token(req.password)
    return {"access_token": token, "token_type": "bearer"}
