from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Enum, JSON, Integer, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class CampaignType(str, enum.Enum):
    MANUAL = "manual"
    PREDICTIVE = "predictive"
    PREVIEW = "preview"
    PROGRESSIVE = "progressive"


class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class CallStatus(str, enum.Enum):
    INITIATED = "initiated"
    RINGING = "ringing"
    ANSWERED = "answered"
    BUSY = "busy"
    NO_ANSWER = "no_answer"
    FAILED = "failed"
    COMPLETED = "completed"
    VOICEMAIL = "voicemail"


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    campaign_type: Mapped[CampaignType] = mapped_column(Enum(CampaignType), nullable=False)
    status: Mapped[CampaignStatus] = mapped_column(Enum(CampaignStatus), default=CampaignStatus.DRAFT)
    dialer_campaign_id: Mapped[Optional[str]] = mapped_column(String(100))
    settings: Mapped[Optional[dict]] = mapped_column(JSON)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    client: Mapped["Client"] = relationship("Client", back_populates="campaigns")
    upload_batches: Mapped[List["UploadBatch"]] = relationship("UploadBatch", back_populates="campaign", cascade="all, delete-orphan")
    call_logs: Mapped[List["CallLog"]] = relationship("CallLog", back_populates="campaign")


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id"), index=True)
    campaign_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("campaigns.id"))
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    total_records: Mapped[int] = mapped_column(Integer, default=0)
    processed_records: Mapped[int] = mapped_column(Integer, default=0)
    failed_records: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    error_log: Mapped[Optional[str]] = mapped_column(Text)
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    campaign: Mapped[Optional["Campaign"]] = relationship("Campaign", back_populates="upload_batches")
    records: Mapped[List["UploadRecord"]] = relationship("UploadRecord", back_populates="batch", cascade="all, delete-orphan")


class UploadRecord(Base):
    __tablename__ = "upload_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(Integer, ForeignKey("upload_batches.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id"), index=True)
    campaign_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("campaigns.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mobile: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    alternate_mobile: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    state: Mapped[Optional[str]] = mapped_column(String(100))
    priority: Mapped[int] = mapped_column(Integer, default=0)
    remarks: Mapped[Optional[str]] = mapped_column(Text)
    extra_data: Mapped[Optional[dict]] = mapped_column(JSON)
    call_status: Mapped[str] = mapped_column(String(50), default="pending")
    call_count: Mapped[int] = mapped_column(Integer, default=0)
    last_called_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    dialer_pushed: Mapped[bool] = mapped_column(Boolean, default=False)
    dialer_pushed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    batch: Mapped["UploadBatch"] = relationship("UploadBatch", back_populates="records")


class CallLog(Base):
    __tablename__ = "call_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id"), index=True)
    campaign_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("campaigns.id"))
    agent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    upload_record_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("upload_records.id"))
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), default="outbound")
    status: Mapped[CallStatus] = mapped_column(Enum(CallStatus), default=CallStatus.INITIATED)
    duration: Mapped[Optional[int]] = mapped_column(Integer)
    recording_url: Mapped[Optional[str]] = mapped_column(String(500))
    disposition: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    dialer_call_id: Mapped[Optional[str]] = mapped_column(String(100))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    answered_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    campaign: Mapped[Optional["Campaign"]] = relationship("Campaign", back_populates="call_logs")


class CallbackSchedule(Base):
    __tablename__ = "callback_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id"), index=True)
    ticket_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tickets.id"))
    call_log_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("call_logs.id"))
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    customer_name: Mapped[Optional[str]] = mapped_column(String(255))
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    is_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
