from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.client import Team, TeamMember, Department
from app.models.user import User, UserRole

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamCreate(BaseModel):
    name: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    description: Optional[str] = None
    client_id: Optional[int] = None
    team_lead_id: Optional[int] = None
    is_active: bool = True


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    department_id: Optional[int] = None
    description: Optional[str] = None
    team_lead_id: Optional[int] = None
    is_active: Optional[bool] = None


class MemberAdd(BaseModel):
    user_id: int


def _member_row(tm: TeamMember, u: User) -> dict:
    return {"id": tm.id, "user_id": u.id, "full_name": u.full_name, "email": u.email}


def _team_dict(team: Team, members: list, dept_name: str | None = None) -> dict:
    return {
        "id": team.id,
        "name": team.name,
        "department_id": team.department_id,
        "department_name": dept_name or team.department_name,
        "description": team.description,
        "client_id": team.client_id,
        "team_lead_id": team.team_lead_id,
        "is_active": team.is_active,
        "created_at": team.created_at,
        "member_count": len(members),
        "members": members,
    }


async def _load_members(db: AsyncSession, team_id: int) -> list:
    res = await db.execute(
        select(TeamMember, User)
        .join(User, TeamMember.user_id == User.id)
        .where(TeamMember.team_id == team_id)
    )
    return [_member_row(tm, u) for tm, u in res.all()]


@router.get("")
async def list_teams(
    client_id: Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Team)
    if current_user.role not in (UserRole.ADMIN,) and current_user.client_id:
        q = q.where(Team.client_id == current_user.client_id)
    if client_id:
        q = q.where(Team.client_id == client_id)
    if department_id:
        q = q.where(Team.department_id == department_id)

    result = await db.execute(q.order_by(Team.name))
    teams = result.scalars().all()

    # Load dept names in bulk
    dept_ids = {t.department_id for t in teams if t.department_id}
    dept_map: dict[int, str] = {}
    if dept_ids:
        dr = await db.execute(select(Department).where(Department.id.in_(dept_ids)))
        for d in dr.scalars().all():
            dept_map[d.id] = d.name

    out = []
    for team in teams:
        members = await _load_members(db, team.id)
        out.append(_team_dict(team, members, dept_map.get(team.department_id or 0)))
    return out


@router.post("")
async def create_team(
    body: TeamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = Team(
        name=body.name,
        department_id=body.department_id,
        department_name=body.department_name,
        description=body.description,
        client_id=body.client_id or current_user.client_id,
        team_lead_id=body.team_lead_id,
        is_active=body.is_active,
    )
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return _team_dict(team, [])


@router.get("/{team_id}")
async def get_team(
    team_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    members = await _load_members(db, team_id)
    dept_name = None
    if team.department_id:
        dept = await db.get(Department, team.department_id)
        dept_name = dept.name if dept else None
    return _team_dict(team, members, dept_name)


@router.patch("/{team_id}")
async def update_team(
    team_id: int,
    body: TeamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if body.name is not None: team.name = body.name
    if body.department_id is not None: team.department_id = body.department_id
    if body.description is not None: team.description = body.description
    if body.team_lead_id is not None: team.team_lead_id = body.team_lead_id
    if body.is_active is not None: team.is_active = body.is_active
    await db.commit()
    return {"ok": True}


@router.delete("/{team_id}")
async def delete_team(
    team_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    await db.delete(team)
    await db.commit()
    return {"ok": True}


@router.post("/{team_id}/members")
async def add_member(
    team_id: int,
    body: MemberAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    existing = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == body.user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "User already in team")
    db.add(TeamMember(team_id=team_id, user_id=body.user_id))
    await db.commit()
    return {"ok": True}


@router.delete("/{team_id}/members/{user_id}")
async def remove_member(
    team_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        delete(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
    )
    await db.commit()
    return {"ok": True}
