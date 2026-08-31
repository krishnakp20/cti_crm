from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.ivr import IVRConfig, IVRRoute, IVRRouteOverride, BackupType

router = APIRouter(prefix="/ivr", tags=["ivr"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class RouteUpsert(BaseModel):
    press_key: str
    department_name: str
    primary_agent_id: Optional[int] = None
    backup_type: BackupType = BackupType.NONE
    backup_agent_id: Optional[int] = None
    backup_number: Optional[str] = None
    queue_name: Optional[str] = None
    dept_audio: Optional[str] = None
    notes: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class OverrideRequest(BaseModel):
    override_agent_id: int
    reason: Optional[str] = None


class ConfigCreate(BaseModel):
    client_id: int
    name: str = "Main IVR"
    welcome_audio: Optional[str] = None
    ring_timeout: int = 30


# ── Helpers ───────────────────────────────────────────────────────────────────

def _route_dict(r: IVRRoute, agents: dict) -> dict:
    return {
        "id": r.id,
        "ivr_config_id": r.ivr_config_id,
        "client_id": r.client_id,
        "press_key": r.press_key,
        "department_name": r.department_name,
        "primary_agent_id": r.primary_agent_id,
        "primary_agent_name": agents.get(r.primary_agent_id, {}).get("name") if r.primary_agent_id else None,
        "primary_agent_extension": agents.get(r.primary_agent_id, {}).get("extension") if r.primary_agent_id else None,
        "backup_type": r.backup_type,
        "backup_agent_id": r.backup_agent_id,
        "backup_agent_name": agents.get(r.backup_agent_id, {}).get("name") if r.backup_agent_id else None,
        "backup_agent_extension": agents.get(r.backup_agent_id, {}).get("extension") if r.backup_agent_id else None,
        "backup_number": r.backup_number,
        "queue_name": r.queue_name,
        "dept_audio": r.dept_audio,
        "notes": r.notes,
        "sort_order": r.sort_order,
        "is_active": r.is_active,
        "override": None,
    }


async def _agent_map(db: AsyncSession, agent_ids: list) -> dict:
    if not agent_ids:
        return {}
    rows = (await db.execute(
        select(User.id, User.full_name, User.extension).where(User.id.in_(agent_ids))
    )).all()
    return {r.id: {"name": r.full_name, "extension": r.extension} for r in rows}


# ── Config endpoints ──────────────────────────────────────────────────────────

@router.get("/configs")
async def list_configs(
    client_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(IVRConfig)
    if current_user.role == UserRole.ADMIN:
        if client_id:
            q = q.where(IVRConfig.client_id == client_id)
    else:
        q = q.where(IVRConfig.client_id == current_user.client_id)
    configs = (await db.execute(q)).scalars().all()
    return [{"id": c.id, "client_id": c.client_id, "name": c.name,
             "welcome_audio": c.welcome_audio, "ring_timeout": c.ring_timeout,
             "is_active": c.is_active} for c in configs]


@router.post("/configs")
async def create_config(
    body: ConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Admin only")
    cfg = IVRConfig(**body.model_dump())
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return {"id": cfg.id, "client_id": cfg.client_id, "name": cfg.name}


@router.put("/configs/{config_id}")
async def update_config(
    config_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.CLIENT):
        raise HTTPException(403, "Insufficient permissions")
    cfg = await db.get(IVRConfig, config_id)
    if not cfg:
        raise HTTPException(404)
    for k, v in body.items():
        if hasattr(cfg, k):
            setattr(cfg, k, v)
    await db.commit()
    return {"ok": True}


# ── Route endpoints ───────────────────────────────────────────────────────────

@router.get("/configs/{config_id}/routes")
async def list_routes(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cfg = await db.get(IVRConfig, config_id)
    if not cfg:
        raise HTTPException(404)
    # Access check
    if current_user.role != UserRole.ADMIN and cfg.client_id != current_user.client_id:
        raise HTTPException(403)

    rows = (await db.execute(
        select(IVRRoute).where(IVRRoute.ivr_config_id == config_id).order_by(IVRRoute.sort_order)
    )).scalars().all()

    # Load active overrides for these routes explicitly (avoid lazy-load in async)
    route_ids = [r.id for r in rows]
    override_map: dict = {}
    if route_ids:
        ov_rows = (await db.execute(
            select(IVRRouteOverride).where(
                IVRRouteOverride.ivr_route_id.in_(route_ids),
                IVRRouteOverride.is_active == True,
            )
        )).scalars().all()
        for ov in ov_rows:
            override_map[ov.ivr_route_id] = ov

    # Collect all agent IDs for bulk lookup
    ids = set()
    for r in rows:
        if r.primary_agent_id: ids.add(r.primary_agent_id)
        if r.backup_agent_id: ids.add(r.backup_agent_id)
        ov = override_map.get(r.id)
        if ov: ids.add(ov.override_agent_id)
    agents = await _agent_map(db, list(ids))

    result = []
    for r in rows:
        ov = override_map.get(r.id)
        ov_dict = None
        if ov:
            ov_dict = {
                "id": ov.id,
                "override_agent_id": ov.override_agent_id,
                "override_agent_name": agents.get(ov.override_agent_id, {}).get("name"),
                "override_agent_extension": agents.get(ov.override_agent_id, {}).get("extension"),
                "reason": ov.reason,
            }
        d = _route_dict(r, agents)
        d["override"] = ov_dict
        result.append(d)
    return result


@router.post("/configs/{config_id}/routes")
async def add_route(
    config_id: int,
    body: RouteUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cfg = await db.get(IVRConfig, config_id)
    if not cfg:
        raise HTTPException(404)
    if current_user.role not in (UserRole.ADMIN, UserRole.CLIENT):
        raise HTTPException(403)
    route = IVRRoute(ivr_config_id=config_id, client_id=cfg.client_id, **body.model_dump())
    db.add(route)
    await db.commit()
    await db.refresh(route)
    return {"id": route.id, "ok": True}


@router.put("/routes/{route_id}")
async def update_route(
    route_id: int,
    body: RouteUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = await db.get(IVRRoute, route_id)
    if not route:
        raise HTTPException(404)
    if current_user.role not in (UserRole.ADMIN, UserRole.CLIENT):
        raise HTTPException(403)
    for k, v in body.model_dump().items():
        setattr(route, k, v)
    await db.commit()
    return {"ok": True}


@router.delete("/routes/{route_id}")
async def delete_route(
    route_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.CLIENT):
        raise HTTPException(403)
    route = await db.get(IVRRoute, route_id)
    if not route:
        raise HTTPException(404)
    await db.delete(route)
    await db.commit()
    return {"ok": True}


# ── Override endpoints ────────────────────────────────────────────────────────

@router.put("/routes/{route_id}/override")
async def set_override(
    route_id: int,
    body: OverrideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.CLIENT):
        raise HTTPException(403)
    route = await db.get(IVRRoute, route_id)
    if not route:
        raise HTTPException(404)

    # Deactivate any existing override for this route
    existing = (await db.execute(
        select(IVRRouteOverride).where(
            IVRRouteOverride.ivr_route_id == route_id,
            IVRRouteOverride.is_active == True,
        )
    )).scalars().all()
    for ov in existing:
        ov.is_active = False

    ov = IVRRouteOverride(
        ivr_route_id=route_id,
        override_agent_id=body.override_agent_id,
        reason=body.reason,
        is_active=True,
        created_by=current_user.id,
    )
    db.add(ov)
    await db.commit()
    return {"ok": True}


@router.delete("/routes/{route_id}/override")
async def clear_override(
    route_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.CLIENT):
        raise HTTPException(403)
    rows = (await db.execute(
        select(IVRRouteOverride).where(
            IVRRouteOverride.ivr_route_id == route_id,
            IVRRouteOverride.is_active == True,
        )
    )).scalars().all()
    for ov in rows:
        ov.is_active = False
    await db.commit()
    return {"ok": True}


# ── AGI lookup endpoint (called by Asterisk AGI script) ───────────────────────

@router.get("/lookup")
async def agi_lookup(
    client_id: int,
    press_key: str,
    db: AsyncSession = Depends(get_db),
):
    """Called by the Asterisk AGI script to get routing for a press key."""
    # Find active config for client
    cfg = (await db.execute(
        select(IVRConfig).where(
            IVRConfig.client_id == client_id,
            IVRConfig.is_active == True,
        )
    )).scalar_one_or_none()
    if not cfg:
        return {"action": "hangup", "reason": "no_config"}

    route = (await db.execute(
        select(IVRRoute).where(
            IVRRoute.ivr_config_id == cfg.id,
            IVRRoute.press_key == press_key,
            IVRRoute.is_active == True,
        )
    )).scalar_one_or_none()
    if not route:
        return {"action": "hangup", "reason": "no_route"}

    # Check for active override
    override = (await db.execute(
        select(IVRRouteOverride).where(
            IVRRouteOverride.ivr_route_id == route.id,
            IVRRouteOverride.is_active == True,
        )
    )).scalar_one_or_none()

    dial_agent_id = override.override_agent_id if override else route.primary_agent_id

    # Resolve extension
    agent_ext = None
    if dial_agent_id:
        u = await db.get(User, dial_agent_id)
        if u:
            agent_ext = u.extension

    backup_ext = None
    if route.backup_agent_id:
        bu = await db.get(User, route.backup_agent_id)
        if bu:
            backup_ext = bu.extension

    return {
        "action": "dial",
        "department": route.department_name,
        "ring_timeout": cfg.ring_timeout,
        "queue_name": route.queue_name,
        "primary_extension": agent_ext,
        "backup_type": route.backup_type,
        "backup_extension": backup_ext,
        "backup_number": route.backup_number,
        "override_active": override is not None,
        "override_extension": agent_ext if override else None,
    }
