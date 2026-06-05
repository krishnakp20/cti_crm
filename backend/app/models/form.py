from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Enum, JSON, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class FieldType(str, enum.Enum):
    TEXT = "text"
    TEXTAREA = "textarea"
    DROPDOWN = "dropdown"
    MULTI_SELECT = "multi_select"
    CHECKBOX = "checkbox"
    RADIO = "radio"
    DATE = "date"
    DATETIME = "datetime"
    FILE = "file"
    MOBILE = "mobile"
    EMAIL = "email"
    NUMBER = "number"
    SECTION = "section"
    HIDDEN = "hidden"


class Form(Base):
    __tablename__ = "forms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("clients.id", ondelete="CASCADE"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(100), default="ticket")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    settings: Mapped[Optional[dict]] = mapped_column(JSON)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    client: Mapped["Client"] = relationship("Client", back_populates="forms")
    fields: Mapped[List["FormField"]] = relationship("FormField", back_populates="form", cascade="all, delete-orphan", order_by="FormField.order")
    versions: Mapped[List["FormVersion"]] = relationship("FormVersion", back_populates="form", cascade="all, delete-orphan")


class FormField(Base):
    __tablename__ = "form_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    form_id: Mapped[int] = mapped_column(Integer, ForeignKey("forms.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    field_type: Mapped[FieldType] = mapped_column(Enum(FieldType), nullable=False)
    placeholder: Mapped[Optional[str]] = mapped_column(String(255))
    default_value: Mapped[Optional[str]] = mapped_column(Text)
    options: Mapped[Optional[List[dict]]] = mapped_column(JSON)
    validations: Mapped[Optional[dict]] = mapped_column(JSON)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    is_editable: Mapped[bool] = mapped_column(Boolean, default=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    section: Mapped[Optional[str]] = mapped_column(String(100))
    parent_field_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("form_fields.id"))
    width: Mapped[str] = mapped_column(String(20), default="full")
    help_text: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    form: Mapped["Form"] = relationship("Form", back_populates="fields")
    rules: Mapped[List["FormFieldRule"]] = relationship("FormFieldRule", back_populates="field", cascade="all, delete-orphan")


class FormFieldRule(Base):
    __tablename__ = "form_field_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    field_id: Mapped[int] = mapped_column(Integer, ForeignKey("form_fields.id", ondelete="CASCADE"))
    trigger_field: Mapped[str] = mapped_column(String(100), nullable=False)
    trigger_operator: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_value: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    field: Mapped["FormField"] = relationship("FormField", back_populates="rules")


class FormVersion(Base):
    __tablename__ = "form_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    form_id: Mapped[int] = mapped_column(Integer, ForeignKey("forms.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    form: Mapped["Form"] = relationship("Form", back_populates="versions")
