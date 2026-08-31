from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, Enum, func, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class BackupType(str, enum.Enum):
    AGENT = "agent"
    VOICEMAIL = "voicemail"
    FORWARDING = "forwarding"
    NONE = "none"


class IVRConfig(Base):
    __tablename__ = "ivr_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id"), index=True)
    name: Mapped[str] = mapped_column(String(100), default="Main IVR")
    welcome_audio: Mapped[Optional[str]] = mapped_column(String(255))
    ring_timeout: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    routes: Mapped[list["IVRRoute"]] = relationship("IVRRoute", back_populates="config", cascade="all, delete-orphan", order_by="IVRRoute.sort_order")


class IVRRoute(Base):
    __tablename__ = "ivr_routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ivr_config_id: Mapped[int] = mapped_column(Integer, ForeignKey("ivr_configs.id"), index=True)
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id"), index=True)
    press_key: Mapped[str] = mapped_column(String(1))
    department_name: Mapped[str] = mapped_column(String(100))
    primary_agent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    backup_type: Mapped[BackupType] = mapped_column(Enum(BackupType), default=BackupType.NONE)
    backup_agent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    backup_number: Mapped[Optional[str]] = mapped_column(String(50))
    queue_name: Mapped[Optional[str]] = mapped_column(String(100))
    dept_audio: Mapped[Optional[str]] = mapped_column(String(255))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    config: Mapped["IVRConfig"] = relationship("IVRConfig", back_populates="routes")
    override: Mapped[Optional["IVRRouteOverride"]] = relationship(
        "IVRRouteOverride",
        back_populates="route",
        primaryjoin="and_(IVRRoute.id == IVRRouteOverride.ivr_route_id, IVRRouteOverride.is_active == True)",
        uselist=False,
        viewonly=True,
    )


class IVRRouteOverride(Base):
    __tablename__ = "ivr_route_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ivr_route_id: Mapped[int] = mapped_column(Integer, ForeignKey("ivr_routes.id"), index=True)
    override_agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    reason: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    route: Mapped["IVRRoute"] = relationship(
        "IVRRoute",
        back_populates="override",
        primaryjoin="IVRRouteOverride.ivr_route_id == IVRRoute.id",
        foreign_keys="IVRRouteOverride.ivr_route_id",
    )
