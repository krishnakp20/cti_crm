from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.core.security import get_password_hash
from app.models.user import User, UserRole, Role, Permission, RolePermission, UserPermission

router = APIRouter(prefix="/users", tags=["users"])


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    mobile: Optional[str] = None
    role: UserRole
    department_id: Optional[int] = None
    role_id: Optional[int] = None


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    department_id: Optional[int] = None
    role_id: Optional[int] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None


class RoleCreateRequest(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None


# ── STATIC ROUTES FIRST (before any /{param} routes) ──────────────────────

@router.get("/roles/list")
async def list_roles(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(Role)
    if current_user.role != UserRole.ADMIN:
        q = q.where((Role.client_id == current_user.client_id) | (Role.is_system == True))
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/roles")
async def create_role(req: RoleCreateRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    client_id = None if current_user.role == UserRole.ADMIN else current_user.client_id
    role = Role(name=req.name, slug=req.slug, description=req.description, client_id=client_id)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


@router.get("/permissions/list")
async def list_permissions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Permission))
    return result.scalars().all()


@router.post("/roles/{role_id}/permissions")
async def assign_role_permissions(
    role_id: int,
    permission_ids: list[int],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RolePermission).where(RolePermission.role_id == role_id))
    existing = {rp.permission_id for rp in result.scalars().all()}

    for pid in permission_ids:
        if pid not in existing:
            db.add(RolePermission(role_id=role_id, permission_id=pid, granted=True))

    for pid in existing - set(permission_ids):
        await db.execute(
            update(RolePermission)
            .where(RolePermission.role_id == role_id, RolePermission.permission_id == pid)
            .values(granted=False)
        )
    await db.commit()
    return {"message": "Permissions updated"}


# ── LIST + CREATE ───────────────────────────────────────────────────────────

@router.get("/")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    role: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(User)
    if current_user.role != UserRole.ADMIN:
        q = q.where(User.client_id == current_user.client_id)
    if search:
        q = q.where((User.full_name.ilike(f"%{search}%")) | (User.email.ilike(f"%{search}%")))
    if role:
        q = q.where(User.role == role)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    q = q.offset((page - 1) * limit).limit(limit).order_by(User.created_at.desc())
    result = await db.execute(q)
    users = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "mobile": u.mobile,
                "role": u.role,
                "role_id": u.role_id,
                "is_active": u.is_active,
                "department_id": u.department_id,
                "client_id": u.client_id,
                "created_at": u.created_at,
                "last_login": u.last_login,
            }
            for u in users
        ],
    }


@router.post("/")
async def create_user(req: UserCreateRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")

    client_id = None if current_user.role == UserRole.ADMIN else current_user.client_id
    user = User(
        email=req.email,
        full_name=req.full_name,
        mobile=req.mobile,
        hashed_password=get_password_hash(req.password),
        role=req.role,
        client_id=client_id,
        department_id=req.department_id,
        role_id=req.role_id,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}


# ── DYNAMIC /{param} ROUTES LAST ───────────────────────────────────────────

@router.get("/{user_id}")
async def get_user(user_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != UserRole.ADMIN and user.client_id != current_user.client_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return user


@router.patch("/{user_id}")
async def update_user(user_id: int, req: UserUpdateRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = req.model_dump(exclude_none=True)
    if data:
        await db.execute(update(User).where(User.id == user_id).values(**data))
        await db.commit()
    return {"message": "Updated"}


@router.post("/{user_id}/permissions")
async def assign_user_permissions(
    user_id: int,
    permissions: list[dict],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for p in permissions:
        result = await db.execute(
            select(UserPermission).where(UserPermission.user_id == user_id, UserPermission.permission_id == p["permission_id"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.granted = p.get("granted", True)
        else:
            db.add(UserPermission(user_id=user_id, permission_id=p["permission_id"], granted=p.get("granted", True)))
    await db.commit()
    return {"message": "Permissions updated"}
