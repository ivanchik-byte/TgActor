from sqlalchemy import Column, Integer, BigInteger, String, Boolean, Float, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

def get_utc_now():
    return datetime.now(timezone.utc)

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String, unique=True, index=True, nullable=False)
    session_string = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    status = Column(String, default="active", nullable=False, server_default="active")
    source_type = Column(String, default="tdata", nullable=False, server_default="tdata")
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    username = Column(String, nullable=True)
    custom_name = Column(String, nullable=True)
    position = Column(Integer, default=0)
    cooldown_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    pool_type = Column(String, default="commenting")

    proxy_id = Column(Integer, ForeignKey("proxies.id", ondelete="SET NULL"), nullable=True)
    proxy = relationship("Proxy", back_populates="accounts")

    # No ORM relationship to ScenarioStep: role_id is a virtual role without FK
    task_logs = relationship("TaskLog", back_populates="account", cascade="all, delete-orphan")
    inbox_messages = relationship("InboxMessage", back_populates="account", cascade="all, delete-orphan")

    @property
    def encrypted_session(self):
        return self.session_string

    @encrypted_session.setter
    def encrypted_session(self, val):
        self.session_string = val

    @property
    def in_commenting_pool(self):
        return self.pool_type == "commenting"

    @in_commenting_pool.setter
    def in_commenting_pool(self, val):
        if val:
            self.pool_type = "commenting"

    @property
    def in_reaction_pool(self):
        return self.pool_type == "reactions"

    @in_reaction_pool.setter
    def in_reaction_pool(self, val):
        if val:
            self.pool_type = "reactions"

class Proxy(Base):
    __tablename__ = "proxies"

    id = Column(Integer, primary_key=True, index=True)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    protocol = Column(String, default="socks5")

    accounts = relationship("Account", back_populates="proxy")

    @property
    def ip(self):
        return self.host

    @ip.setter
    def ip(self, val):
        self.host = val

    @property
    def status(self):
        return "active"

    @status.setter
    def status(self, val):
        pass

class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)

    min_delay = Column(Float, default=5.0)
    max_delay = Column(Float, default=10.0)

    weight = Column(Integer, default=1)
    created_at = Column(DateTime, default=get_utc_now)

    # AI configuration fields
    mode = Column(String, default="manual")
    ai_prompt = Column(Text, nullable=True)
    ai_provider = Column(String, nullable=True)
    ai_model = Column(String, nullable=True)
    system_instruction = Column(Text, nullable=True)

    steps = relationship("ScenarioStep", back_populates="scenario", cascade="all, delete-orphan")
    task_logs = relationship("TaskLog", back_populates="scenario")

class ScenarioStep(Base):
    __tablename__ = "scenario_steps"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False)
    # role_id references a virtual scenario role, not a real account row.
    # AI-generated scenarios may use synthetic role ids, so no FK here.
    role_id = Column(Integer, nullable=False)

    message_type = Column(String, default="normal")
    reply_to_step_id = Column(Integer, ForeignKey("scenario_steps.id"), nullable=True)

    text = Column(Text, nullable=True)
    media_path = Column(String, nullable=True)

    delay_before_min = Column(Float, nullable=True)
    delay_before_max = Column(Float, nullable=True)

    reactions = Column(String, nullable=True)
    reaction_count = Column(Integer, default=0)

    reaction_source = Column(String, default="pool")
    reaction_roles = Column(String, nullable=True)

    # AI dynamic step fields
    is_ai_dynamic = Column(Boolean, default=False)
    ai_prompt = Column(Text, nullable=True)

    step_order = Column(Integer, nullable=False, default=1)

    scenario = relationship("Scenario", back_populates="steps")

    reply_to_step = relationship("ScenarioStep", remote_side=[id])

class MonitoredChannel(Base):
    __tablename__ = "monitored_channels"

    id = Column(Integer, primary_key=True, index=True)
    channel_username = Column(String, unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True)

    min_delay_seconds = Column(Integer, default=10)
    max_delay_seconds = Column(Integer, default=30)

    no_repeat_scenarios = Column(Boolean, default=True)
    history_json = Column(Text, default="[]")

    # Mode: 'scenario' (multi-bot thread) or 'first_comment' (single bot / send as channel)
    execution_mode = Column(String, default="scenario", nullable=False, server_default="scenario")
    sender_account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    send_as_mode = Column(String, default="account", nullable=False, server_default="account") # 'account' or 'channel'
    send_as_channel_username = Column(String, nullable=True)
    custom_prompt = Column(Text, nullable=True)
    ai_model = Column(String, nullable=True)
    skip_ads = Column(Boolean, default=True, server_default="true")

    sender_account = relationship("Account", foreign_keys=[sender_account_id])

class TaskLog(Base):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True)
    status = Column(String, nullable=False)
    error_message = Column(Text, nullable=True)
    executed_at = Column(DateTime, default=get_utc_now)

    scenario = relationship("Scenario", back_populates="task_logs")
    account = relationship("Account", back_populates="task_logs")

class InboxMessage(Base):
    __tablename__ = "inbox_messages"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(BigInteger, nullable=True)
    peer_id = Column(BigInteger, nullable=False)
    peer_name = Column(String, nullable=True)
    peer_username = Column(String, nullable=True)
    incoming = Column(Boolean, default=True)
    text = Column(Text, nullable=True)
    media_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    __table_args__ = (
        UniqueConstraint("account_id", "peer_id", "message_id", name="uq_inbox_msg"),
    )

    account = relationship("Account", back_populates="inbox_messages")

class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)

class ActionLog(Base):
    __tablename__ = "bot_action_log"

    id = Column(Integer, primary_key=True, index=True)
    executed_at = Column(DateTime, default=get_utc_now, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True, index=True)
    
    action_type = Column(String(50), nullable=False, index=True)
    status = Column(String(20), nullable=False, index=True)
    target = Column(String(255), nullable=True)
    target_id = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)

    account = relationship("Account", backref="action_logs")
    scenario = relationship("Scenario", backref="action_logs")

class AiPreset(Base):
    __tablename__ = "ai_presets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    api_key = Column(Text, nullable=True)
    model = Column(String, nullable=True)
    base_url = Column(String, nullable=True)
    system_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, default="software", nullable=False)
    mode = Column(String, default="dynamic", nullable=False)
    prompt_text = Column(Text, nullable=False)
    system_instruction = Column(Text, nullable=True)
    roles_breakdown = Column(Text, nullable=True)
    steps_payload = Column(Text, nullable=True)
    tags = Column(String, nullable=True)
    is_builtin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=get_utc_now)


