from typing import Optional
from datetime import datetime
from sqlalchemy import BigInteger, Text, String, Boolean, Integer, DateTime, ForeignKey, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Proxy(Base):
    __tablename__ = 'proxies'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    ip: Mapped[str] = mapped_column(String(45), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    protocol: Mapped[str] = mapped_column(String(10), default='socks5')  # SOCKS5/HTTP
    status: Mapped[str] = mapped_column(String(20), default='active')    # active, dead
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Account(Base):
    __tablename__ = 'accounts'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    telegram_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    encrypted_session: Mapped[str] = mapped_column(Text, nullable=False)
    proxy_id: Mapped[Optional[int]] = mapped_column(ForeignKey('proxies.id'), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='active')    # active, cooldown, banned, invalid, unassigned_proxy
    source_type: Mapped[str] = mapped_column(String(20), nullable=False) # tdata, phone_auth
    cooldown_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    in_commenting_pool: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    in_reaction_pool: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    proxy: Mapped[Optional['Proxy']] = relationship()


class Scenario(Base):
    __tablename__ = 'scenarios'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    min_delay: Mapped[float] = mapped_column(Float, default=3.0)
    max_delay: Mapped[float] = mapped_column(Float, default=8.0)
    weight: Mapped[int] = mapped_column(Integer, default=1, server_default='1')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ScenarioStep(Base):
    __tablename__ = 'scenario_steps'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey('scenarios.id'), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    role_id: Mapped[int] = mapped_column(Integer, nullable=False)
    message_type: Mapped[str] = mapped_column(String(20), nullable=False) # text, reply, media
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    media_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    delay_before_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    delay_before_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reactions: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reaction_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reply_to_step_id: Mapped[Optional[int]] = mapped_column(ForeignKey('scenario_steps.id'), nullable=True)
    reaction_source: Mapped[str] = mapped_column(String(20), default='pool', server_default='pool')
    reaction_roles: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    scenario: Mapped['Scenario'] = relationship()


class TaskLog(Base):
    __tablename__ = 'task_logs'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[Optional[int]] = mapped_column(ForeignKey('accounts.id'), nullable=True)
    scenario_id: Mapped[Optional[int]] = mapped_column(ForeignKey('scenarios.id'), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)       # success, error
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class InboxMessage(Base):
    __tablename__ = 'inbox_messages'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey('accounts.id'), nullable=False)
    peer_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    message_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sender_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_incoming: Mapped[bool] = mapped_column(Boolean, default=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    media_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    media_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class SystemConfig(Base):
    __tablename__ = 'system_config'
    
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class MonitoredChannel(Base):
    __tablename__ = 'monitored_channels'
    
    id: Mapped[int] = mapped_column(primary_key=True)
    channel_identifier: Mapped[str] = mapped_column(String(255), nullable=False)  # @username, numeric ID, or t.me link
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    no_repeat_scenarios: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    min_delay_seconds: Mapped[int] = mapped_column(Integer, default=60, server_default='60')
    max_delay_seconds: Mapped[int] = mapped_column(Integer, default=300, server_default='300')
    last_scenario_ids_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array of recently used scenario IDs
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

