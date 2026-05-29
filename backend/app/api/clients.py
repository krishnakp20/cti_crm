from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import Optional, List
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.middleware.auth import get_current_user, require_admin
from app.models.user import User, UserRole
from app.models.client import Client, ClientStatus, Department, Team

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    gst_number: Optional[str] = None
    max_agents: Optional[int] = None
    max_users: Optional[int] = None
    plan: Optional[str] = None


class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    head_user_id: Optional[int] = None


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    department_id: Optional[int] = None
    team_lead_id: Optional[int] = None


@router.get("/")
async def list_clients(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Client)
    if status:
        q = q.where(Client.status == status)
    if search:
        q = q.where(Client.company_name.ilike(f"%{search}%"))

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    q = q.offset((page - 1) * limit).limit(limit).order_by(Client.created_at.desc())
    result = await db.execute(q)
    clients = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [
            {
                "id": c.id,
                "company_name": c.company_name,
                "slug": c.slug,
                "email": c.email,
                "mobile": c.mobile,
                "status": c.status,
                "plan": c.plan,
                "created_at": c.created_at,
            }
            for c in clients
        ],
    }


@router.get("/me")
async def get_my_client(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.client_id:
        raise HTTPException(status_code=404, detail="No client associated")
    result = await db.execute(select(Client).where(Client.id == current_user.client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.get("/{client_id}")
async def get_client(client_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != UserRole.ADMIN and current_user.client_id != client_id:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.patch("/{client_id}")
async def update_client(
    client_id: int,
    req: ClientUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.ADMIN and current_user.client_id != client_id:
        raise HTTPException(status_code=403, detail="Access denied")
    data = req.model_dump(exclude_none=True)
    if data:
        await db.execute(update(Client).where(Client.id == client_id).values(**data))
        await db.commit()
    return {"message": "Updated"}


@router.post("/{client_id}/activate")
async def activate_client(client_id: int, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timezone
    await db.execute(
        update(Client).where(Client.id == client_id).values(
            status=ClientStatus.ACTIVE,
            activated_at=datetime.now(timezone.utc),
            activated_by=current_user.id,
        )
    )
    await db.execute(update(User).where(User.client_id == client_id).values(is_active=True))
    await db.commit()
    return {"message": "Client activated"}


@router.post("/{client_id}/deactivate")
async def deactivate_client(client_id: int, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Client).where(Client.id == client_id).values(status=ClientStatus.INACTIVE))
    await db.commit()
    return {"message": "Client deactivated"}


@router.get("/{client_id}/departments")
async def list_departments(client_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.client_id == client_id, Department.is_active == True))
    return result.scalars().all()


@router.post("/{client_id}/departments")
async def create_department(client_id: int, req: DepartmentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    dept = Department(client_id=client_id, **req.model_dump(exclude_none=True))
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


@router.get("/{client_id}/teams")
async def list_teams(client_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Team).where(Team.client_id == client_id, Team.is_active == True))
    return result.scalars().all()


@router.post("/{client_id}/teams")
async def create_team(client_id: int, req: TeamCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    team = Team(client_id=client_id, **req.model_dump(exclude_none=True))
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team
