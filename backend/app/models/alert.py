from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Enum, JSON, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class AlertChannel(str, enum.Enum):
    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    IN_APP = "in_app"


class AlertTrigger(str, enum.Enum):
    TICKET_CREATED = "ticket_created"
    TICKET_UPDATED = "ticket_updated"
    TICKET_CLOSED = "ticket_closed"
    TICKET_ASSIGNED = "ticket_assigned"
    SLA_BREACH = "sla_breach"
    ESCALATION = "escalation"
    CALLBACK_REMINDER = "callback_reminder"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger: Mapped[AlertTrigger] = mapped_column(Enum(AlertTrigger), nullable=False)
    channels: Mapped[List[str]] = mapped_column(JSON, nullable=False)
    recipients: Mapped[dict] = mapped_column(JSON, nullable=False)
    template_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("alert_templates.id"))
    conditions: Mapped[Optional[dict]] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    template: Mapped[Optional["AlertTemplate"]] = relationship("AlertTemplate")


class AlertTemplate(Base):
    __tablename__ = "alert_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("clients.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    channel: Mapped[AlertChannel] = mapped_column(Enum(AlertChannel), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[Optional[List[str]]] = mapped_column(JSON)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class EscalationRule(Base):
    __tablename__ = "escalation_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[Optional[str]] = mapped_column(String(50))
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"))
    levels: Mapped[List[dict]] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    logs: Mapped[List["EscalationLog"]] = relationship("EscalationLog", back_populates="rule", cascade="all, delete-orphan")


class EscalationLog(Base):
    __tablename__ = "escalation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    rule_id: Mapped[int] = mapped_column(Integer, ForeignKey("escalation_rules.id"))
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    escalated_to: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    reason: Mapped[Optional[str]] = mapped_column(Text)
    notified_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    rule: Mapped["EscalationRule"] = relationship("EscalationRule", back_populates="logs")
