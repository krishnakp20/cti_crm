from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Enum, JSON, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class TicketPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TicketStatusEnum(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    PENDING = "pending"
    RESOLVED = "resolved"
    CLOSED = "closed"
    REOPENED = "reopened"


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id"), index=True)
    form_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("forms.id"))
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    priority: Mapped[TicketPriority] = mapped_column(Enum(TicketPriority), default=TicketPriority.MEDIUM)
    status: Mapped[TicketStatusEnum] = mapped_column(Enum(TicketStatusEnum), default=TicketStatusEnum.OPEN)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    assigned_to: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"))
    team_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("teams.id"))
    customer_name: Mapped[Optional[str]] = mapped_column(String(255))
    customer_email: Mapped[Optional[str]] = mapped_column(String(255))
    customer_mobile: Mapped[Optional[str]] = mapped_column(String(20))
    form_data: Mapped[Optional[dict]] = mapped_column(JSON)
    tags: Mapped[Optional[List[str]]] = mapped_column(JSON)
    call_log_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("call_logs.id"))
    sla_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    first_response_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    reopened_count: Mapped[int] = mapped_column(Integer, default=0)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)
    is_merged: Mapped[bool] = mapped_column(Boolean, default=False)
    merged_into: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tickets.id"))
    parent_ticket_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tickets.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    comments: Mapped[List["TicketComment"]] = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan")
    logs: Mapped[List["TicketLog"]] = relationship("TicketLog", back_populates="ticket", cascade="all, delete-orphan")
    attachments: Mapped[List["TicketAttachment"]] = relationship("TicketAttachment", back_populates="ticket", cascade="all, delete-orphan")


class TicketStatus(Base):
    __tablename__ = "ticket_statuses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="comments")


class TicketLog(Base):
    __tablename__ = "ticket_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(Text)
    new_value: Mapped[Optional[str]] = mapped_column(Text)
    meta: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="logs")


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"))
    comment_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("ticket_comments.id"))
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer)
    mime_type: Mapped[Optional[str]] = mapped_column(String(100))
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="attachments")


class TicketTag(Base):
    __tablename__ = "ticket_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
