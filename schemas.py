from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class ProxyBase(BaseModel):
    ip: str = Field(..., max_length=45)
    port: int
    username: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = Field(None, max_length=255)
    protocol: str = Field(default="socks5", max_length=10)
    status: str = Field(default="active", max_length=20)

class ProxyCreate(ProxyBase):
    pass

class ProxyResponse(ProxyBase):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class AccountBase(BaseModel):
    phone: Optional[str] = Field(None, max_length=20)
    telegram_id: Optional[int] = None
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    username: Optional[str] = Field(None, max_length=100)
    proxy_id: Optional[int] = None
    status: str = Field(default="active", max_length=20)
    source_type: str = Field(..., max_length=20)

class AccountCreate(AccountBase):
    encrypted_session: str

class AccountResponse(AccountBase):
    id: int
    cooldown_until: Optional[datetime]
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
