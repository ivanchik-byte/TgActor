from pydantic import BaseModel, Field, ConfigDict, model_validator
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
    custom_name: Optional[str] = None
    status: Optional[str] = 'active'
    source_type: Optional[str] = 'tdata'
    position: Optional[int] = 0
    pool_type: Optional[str] = 'commenting'
    proxy_id: Optional[int] = None

    class Config:
        from_attributes = True

class AccountCustomNameUpdate(BaseModel):
    custom_name: Optional[str] = None

class AccountReorderRequest(BaseModel):
    ids: List[int]

class AccountProxyUpdate(BaseModel):
    proxy_id: Optional[int] = None

class AccountPoolsUpdate(BaseModel):
    pool_type: Optional[str] = None
    in_commenting_pool: Optional[bool] = None
    in_reaction_pool: Optional[bool] = None

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

class AiPresetCreate(BaseModel):
    name: str
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    system_prompt: Optional[str] = None

class AiPresetResponse(BaseModel):
    id: int
    name: str
    model: Optional[str] = None
    base_url: Optional[str] = None
    has_key: bool = False
    created_at: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class AIScenarioGenerateRequest(BaseModel):
    prompt: str
    accounts_count: Optional[int] = 3
    steps_count: Optional[int] = None
    reactions_enabled: Optional[bool] = True
    is_dynamic: Optional[bool] = False
    provider: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None

class ProxyBase(BaseModel):
    host: str
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    protocol: Optional[str] = "socks5"

class ProxyCreate(BaseModel):
    host: Optional[str] = None
    ip: Optional[str] = None
    port: int
    username: Optional[str] = None
    password: Optional[str] = None
    protocol: Optional[str] = "socks5"

    @model_validator(mode="before")
    @classmethod
    def resolve_host_or_ip(cls, data: Any) -> Any:
        if isinstance(data, dict):
            h = data.get("host") or data.get("ip")
            if not h:
                raise ValueError("Host or IP is required for proxy")
            data["host"] = str(h).strip()
            data["ip"] = str(h).strip()
        return data

class ProxyResponse(ProxyBase):
    id: int
    host: str
    ip: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def set_ip_from_host(cls, data: Any) -> Any:
        if hasattr(data, "host"):
            return {
                "id": getattr(data, "id", None),
                "host": data.host,
                "ip": data.host,
                "port": data.port,
                "username": data.username,
                "password": data.password,
                "protocol": data.protocol
            }
        elif isinstance(data, dict):
            h = data.get("host") or data.get("ip")
            data["host"] = h
            data["ip"] = h
        return data

    class Config:
        from_attributes = True

class MonitoredChannelBase(BaseModel):
    channel_username: str
    is_active: Optional[bool] = True
    min_delay_seconds: Optional[int] = 10
    max_delay_seconds: Optional[int] = 30
    no_repeat_scenarios: Optional[bool] = True

class MonitoredChannelCreate(MonitoredChannelBase):
    pass

class MonitoredChannelResponse(MonitoredChannelBase):
    id: int

    class Config:
        from_attributes = True
