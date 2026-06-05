from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional, List
from pydantic import BaseModel
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.alert import Alert, AlertTemplate, EscalationRule, AlertTrigger

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    name: str
    trigger: AlertTrigger
    channels: List[str]
    recipients: dict
    template_id: Optional[int] = None
    conditions: Optional[dict] = None
    is_active: Optional[bool] = True


class AlertTemplateCreate(BaseModel):
    name: str
    channel: str
    subject: Optional[str] = None
    body: str
    variables: Optional[List[str]] = None


class EscalationRuleCreate(BaseModel):
    name: str
    priority: Optional[str] = None
    department_id: Optional[int] = None
    levels: List[dict]
    is_active: Optional[bool] = True


# ── STATIC ROUTES FIRST ────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AlertTemplate).where(
            (AlertTemplate.client_id == current_user.client_id) | (AlertTemplate.is_system == True)
        )
    )
    return result.scalars().all()


@router.post("/templates")
async def create_template(req: AlertTemplateCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    template = AlertTemplate(client_id=current_user.client_id, **req.model_dump(exclude_none=True))
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/escalations")
async def list_escalations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(EscalationRule)
    if current_user.role != UserRole.ADMIN and current_user.client_id:
        q = q.where(EscalationRule.client_id == current_user.client_id)
    result = await db.execute(q.order_by(EscalationRule.id))
    return result.scalars().all()


@router.post("/escalations")
async def create_escalation(req: EscalationRuleCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rule = EscalationRule(client_id=current_user.client_id, **req.model_dump(exclude_none=True))
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/escalations/{rule_id}")
async def update_escalation(rule_id: int, req: EscalationRuleCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = req.model_dump(exclude_none=True)
    await db.execute(update(EscalationRule).where(EscalationRule.id == rule_id).values(**data))
    await db.commit()
    return {"message": "Updated"}


@router.delete("/escalations/{rule_id}")
async def delete_escalation(rule_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EscalationRule).where(EscalationRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule:
        await db.delete(rule)
        await db.commit()
    return {"message": "Deleted"}


@router.post("/escalations/{rule_id}/toggle")
async def toggle_escalation(rule_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EscalationRule).where(EscalationRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Not found")
    await db.execute(update(EscalationRule).where(EscalationRule.id == rule_id).values(is_active=not rule.is_active))
    await db.commit()
    return {"is_active": not rule.is_active}


# ── ROOT LIST + CREATE ──────────────────────────────────────────────────────

@router.get("/")
async def list_alerts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(Alert)
    if current_user.role != UserRole.ADMIN and current_user.client_id:
        q = q.where(Alert.client_id == current_user.client_id)
    result = await db.execute(q.order_by(Alert.id))
    return result.scalars().all()


@router.post("/")
async def create_alert(req: AlertCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alert = Alert(client_id=current_user.client_id, **req.model_dump(exclude_none=True))
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


# ── DYNAMIC /{id} ROUTES LAST ──────────────────────────────────────────────

@router.get("/{alert_id}")
async def get_alert(alert_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.patch("/{alert_id}")
async def update_alert(alert_id: int, req: AlertCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    data = req.model_dump(exclude_none=True)
    await db.execute(update(Alert).where(Alert.id == alert_id).values(**data))
    await db.commit()
    return {"message": "Updated"}


@router.post("/{alert_id}/toggle")
async def toggle_alert(alert_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Not found")
    await db.execute(update(Alert).where(Alert.id == alert_id).values(is_active=not alert.is_active))
    await db.commit()
    return {"is_active": not alert.is_active}


@router.delete("/{alert_id}")
async def delete_alert(alert_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if alert:
        await db.delete(alert)
        await db.commit()
    return {"message": "Deleted"}
