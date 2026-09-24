from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, List, Any, Literal

AiProvider = Literal["openai", "deepseek", "nvidia", "openrouter", "gemini", "custom"]

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

    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)

from app.core.ai_defaults import DEFAULT_SYSTEM_PROMPT

class AISettingsSchema(BaseModel):
    ai_provider: AiProvider = "openai"
    ai_api_key: Optional[str] = Field(default=None, max_length=500)
    ai_default_model: str = Field(default="gpt-4o-mini", max_length=200)
    ai_system_prompt: Optional[str] = Field(default=DEFAULT_SYSTEM_PROMPT, max_length=20000)
    ai_base_url: Optional[str] = Field(default=None, max_length=500)

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
    prompt: str = Field(min_length=3, max_length=4000)
    accounts_count: Optional[int] = Field(default=3, ge=1, le=10)
    steps_count: Optional[int] = Field(default=None, ge=3, le=25)
    reactions_enabled: Optional[bool] = True
    is_dynamic: Optional[bool] = False
    provider: Optional[AiProvider] = None
    model: Optional[str] = Field(default=None, max_length=200)
    system_prompt: Optional[str] = Field(default=None, max_length=20000)

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

    model_config = ConfigDict(from_attributes=True)

class MonitoredChannelBase(BaseModel):
    channel_username: str
    is_active: Optional[bool] = True
    min_delay_seconds: Optional[int] = 10
    max_delay_seconds: Optional[int] = 30
    no_repeat_scenarios: Optional[bool] = True
    execution_mode: Optional[str] = "scenario"
    sender_account_id: Optional[int] = None
    send_as_mode: Optional[str] = "account"
    send_as_channel_username: Optional[str] = None
    custom_prompt: Optional[str] = None
    ai_model: Optional[str] = None
    skip_ads: Optional[bool] = True

class MonitoredChannelCreate(MonitoredChannelBase):
    pass

class MonitoredChannelResponse(MonitoredChannelBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

class CategoryItem(BaseModel):
    id: str
    label: str
    color: Optional[str] = "#38bdf8"
    is_builtin: Optional[bool] = False

class CategoryCreate(BaseModel):
    label: str
    color: Optional[str] = "#38bdf8"

class PromptTemplateBase(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = "software"
    categories: Optional[List[str]] = None
    mode: str = "dynamic"
    prompt_text: str
    system_instruction: Optional[str] = None
    roles_breakdown: Optional[str] = None
    steps_payload: Optional[str] = None
    tags: Optional[str] = None
    is_builtin: Optional[bool] = False

class PromptTemplateCreate(PromptTemplateBase):
    pass

class PromptTemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    categories: Optional[List[str]] = None
    mode: Optional[str] = None
    prompt_text: Optional[str] = None
    system_instruction: Optional[str] = None
    roles_breakdown: Optional[str] = None
    steps_payload: Optional[str] = None
    tags: Optional[str] = None
    is_builtin: Optional[bool] = None

class PromptTemplateResponse(PromptTemplateBase):
    id: int
    categories: List[str] = []
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class StudioGenerateRequest(BaseModel):
    topic: str
    mode: str = "dynamic"
    drama_type: str = "skepticism_proof"
    tone: str = "telegram_slang"
    roles_count: int = 3
    steps_count: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None

class StudioRoleInstruction(BaseModel):
    role_order: int
    role_name: str
    goal: str
    instruction: str
    sample_text: str

class StudioGenerateResponse(BaseModel):
    title: str
    category: str
    mode: str
    prompt_text: str
    system_instruction: Optional[str] = None
    roles: List[StudioRoleInstruction]
    steps_payload: List[dict]

class CreateScenarioFromStudioRequest(BaseModel):
    title: str
    mode: str = "dynamic"
    prompt_text: str
    min_delay: float = 5.0
    max_delay: float = 12.0
    weight: int = 1
    steps: List[dict]

