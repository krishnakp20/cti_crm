from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional, List
from pydantic import BaseModel
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.form import Form, FormField, FormFieldRule, FormVersion, FieldType

router = APIRouter(prefix="/forms", tags=["forms"])


class FormFieldCreate(BaseModel):
    label: str
    field_name: str
    field_type: FieldType
    placeholder: Optional[str] = None
    default_value: Optional[str] = None
    options: Optional[List[dict]] = None
    validations: Optional[dict] = None
    is_required: bool = False
    order: int = 0
    section: Optional[str] = None
    parent_field_id: Optional[int] = None
    width: str = "full"
    help_text: Optional[str] = None


class FormCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    category: str = "ticket"
    is_public: bool = False
    settings: Optional[dict] = None
    fields: List[FormFieldCreate] = []
    assign_to_client_id: Optional[int] = None  # admin can assign to a client


class FormUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None
    settings: Optional[dict] = None
    fields: Optional[List[FormFieldCreate]] = None


@router.get("")
async def list_forms(
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Form)
    if current_user.role != UserRole.ADMIN:
        q = q.where(Form.client_id == current_user.client_id)
    if category:
        q = q.where(Form.category == category)
    result = await db.execute(q.where(Form.is_active == True).order_by(Form.created_at.desc()))
    forms = result.scalars().all()
    return forms


@router.post("")
async def create_form(req: FormCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Admin can assign to a client, otherwise use own client_id
    if current_user.role == UserRole.ADMIN and req.assign_to_client_id:
        client_id = req.assign_to_client_id
    else:
        client_id = current_user.client_id
    form = Form(
        client_id=client_id,
        name=req.name,
        slug=req.slug,
        description=req.description,
        category=req.category,
        is_public=req.is_public,
        settings=req.settings,
        created_by=current_user.id,
    )
    db.add(form)
    await db.flush()

    for field_data in req.fields:
        field = FormField(form_id=form.id, **field_data.model_dump(exclude_none=True))
        db.add(field)

    await db.commit()
    await db.refresh(form)
    return form


@router.get("/{form_id}")
async def get_form(form_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Form).where(Form.id == form_id))
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


@router.patch("/{form_id}")
async def update_form(form_id: int, req: FormUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Form).where(Form.id == form_id))
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    snapshot = {"name": form.name, "version": form.version}
    form_version = FormVersion(form_id=form_id, version=form.version, snapshot=snapshot, created_by=current_user.id)
    db.add(form_version)

    data = req.model_dump(exclude_none=True)
    fields = data.pop("fields", None)

    if data:
        data["version"] = form.version + 1
        await db.execute(update(Form).where(Form.id == form_id).values(**data))

    if fields is not None:
        from sqlalchemy import delete
        await db.execute(delete(FormField).where(FormField.form_id == form_id))
        for field_data in fields:
            field = FormField(form_id=form_id, **field_data if isinstance(field_data, dict) else field_data.model_dump(exclude_none=True))
            db.add(field)

    await db.commit()
    return {"message": "Form updated"}


@router.delete("/{form_id}")
async def delete_form(form_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Form).where(Form.id == form_id).values(is_active=False))
    await db.commit()
    return {"message": "Form deleted"}


@router.post("/{form_id}/assign")
async def assign_form_to_client(
    form_id: int,
    client_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin assigns an existing form to a client"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    await db.execute(update(Form).where(Form.id == form_id).values(client_id=client_id))
    await db.commit()
    return {"message": f"Form {form_id} assigned to client {client_id}"}


@router.get("/{form_id}/fields")
async def get_form_fields(form_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FormField).where(FormField.form_id == form_id).order_by(FormField.order))
    return result.scalars().all()
