from pydantic import BaseModel, Field
from typing import Optional, List, Any

class AccountBase(BaseModel):
    phone: str
    is_active: Optional[bool] = True

class AccountCreate(AccountBase):
    session_string: str

class AccountResponse(AccountBase):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    pool_type: Optional[str] = 'commenting'
    proxy_id: Optional[int] = None

    class Config:
        from_attributes = True

class ScenarioBase(BaseModel):
    title: str
    is_active: Optional[bool] = True
    min_delay: Optional[float] = 5.0
    max_delay: Optional[float] = 10.0
    weight: Optional[int] = 1

    mode: Optional[str] = "manual"
    ai_prompt: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    system_instruction: Optional[str] = None

class ScenarioCreate(ScenarioBase):
    pass

class ScenarioUpdate(ScenarioBase):
    pass

class ScenarioResponse(ScenarioBase):
    id: int

    class Config:
        from_attributes = True

from app.services.ai_service import DEFAULT_SYSTEM_PROMPT

class AISettingsSchema(BaseModel):
    ai_provider: str = "openai" # 'openai', 'deepseek', 'nvidia', 'openrouter', 'gemini', 'custom'
    ai_api_key: Optional[str] = None
    ai_default_model: str = "gpt-4o-mini"
    ai_system_prompt: Optional[str] = DEFAULT_SYSTEM_PROMPT
    ai_base_url: Optional[str] = None

class AIScenarioGenerateRequest(BaseModel):
    prompt: str
    accounts_count: Optional[int] = 3
    reactions_enabled: Optional[bool] = True
    provider: Optional[str] = None
    model: Optional[str] = None

class ProxyBase(BaseModel):
    host: str
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    protocol: Optional[str] = "socks5"

class ProxyCreate(ProxyBase):
    pass

class ProxyResponse(ProxyBase):
    id: int

    class Config:
        from_attributes = True

class MonitoredChannelBase(BaseModel):
    channel_username: str
    is_active: Optional[bool] = True
    min_delay_seconds: Optional[int] = 10
    max_delay_seconds: Optional[int] = 30
    no_repeat_scenarios: Optional[int] = 3

class MonitoredChannelCreate(MonitoredChannelBase):
    pass

class MonitoredChannelResponse(MonitoredChannelBase):
    id: int

    class Config:
        from_attributes = True
