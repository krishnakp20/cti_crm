from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class CallRecord(Base):
    """
    Full CDR record for every inbound IVR call.
    Created by AMI events; enriched by agent wrap-up.
    """
    __tablename__ = "call_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asterisk_unique_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True)
    caller_number: Mapped[str] = mapped_column(String(30), index=True)
    client_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("clients.id"), index=True)

    # IVR path
    ivr_selection: Mapped[Optional[str]] = mapped_column(String(10))   # e.g. "1", "2"
    department: Mapped[Optional[str]] = mapped_column(String(100))
    queue_name: Mapped[Optional[str]] = mapped_column(String(100))

    # Team / agent
    team_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("teams.id"))
    agent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    agent_name: Mapped[Optional[str]] = mapped_column(String(255))
    agent_extension: Mapped[Optional[str]] = mapped_column(String(20))

    # Timeline
    queue_start_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    call_start_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    call_end_time: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Durations (seconds)
    queue_duration: Mapped[Optional[int]] = mapped_column(Integer)   # wait time
    call_duration: Mapped[Optional[int]] = mapped_column(Integer)    # talk time

    # Call outcome
    call_status: Mapped[str] = mapped_column(String(50), default="initiated")
    # initiated | answered | no_answer | abandoned | voicemail

    # Wrap-up / tagging (filled by agent after call)
    disposition: Mapped[Optional[str]] = mapped_column(String(100))
    call_summary: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[Optional[list]] = mapped_column(JSON)

    # Linked ticket
    ticket_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tickets.id"))

    # Recording
    recording_filename: Mapped[Optional[str]] = mapped_column(String(255))
    recording_path: Mapped[Optional[str]] = mapped_column(String(500))
    recording_duration: Mapped[Optional[int]] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    agent: Mapped[Optional["User"]] = relationship("User", foreign_keys=[agent_id])
    team: Mapped[Optional["Team"]] = relationship("Team")
