from sqlalchemy import Column, Integer, BigInteger, String, Boolean, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

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
    created_at = Column(DateTime, default=datetime.utcnow)

    pool_type = Column(String, default="commenting")

    proxy_id = Column(Integer, ForeignKey("proxies.id", ondelete="SET NULL"), nullable=True)
    proxy = relationship("Proxy", back_populates="accounts")

    steps = relationship("ScenarioStep", back_populates="account")
    task_logs = relationship("TaskLog", back_populates="account")
    inbox_messages = relationship("InboxMessage", back_populates="account")

class Proxy(Base):
    __tablename__ = "proxies"

    id = Column(Integer, primary_key=True, index=True)
    host = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    protocol = Column(String, default="socks5")

    accounts = relationship("Account", back_populates="proxy")

class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)

    min_delay = Column(Float, default=5.0)
    max_delay = Column(Float, default=10.0)

    weight = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

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
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    role_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)

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
    account = relationship("Account", back_populates="steps")

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

class TaskLog(Base):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    status = Column(String, nullable=False)
    error_message = Column(Text, nullable=True)
    executed_at = Column(DateTime, default=datetime.utcnow)

    scenario = relationship("Scenario", back_populates="task_logs")
    account = relationship("Account", back_populates="task_logs")

class InboxMessage(Base):
    __tablename__ = "inbox_messages"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    message_id = Column(BigInteger, nullable=True)
    peer_id = Column(BigInteger, nullable=False)
    peer_name = Column(String, nullable=True)
    peer_username = Column(String, nullable=True)
    incoming = Column(Boolean, default=True)
    text = Column(Text, nullable=True)
    media_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="inbox_messages")

class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)

class ActionLog(Base):
    __tablename__ = "bot_action_log"

    id = Column(Integer, primary_key=True, index=True)
    executed_at = Column(DateTime, default=datetime.utcnow, index=True)
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
    created_at = Column(DateTime, default=datetime.utcnow)
