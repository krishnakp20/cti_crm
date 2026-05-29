from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case
from typing import Optional
from datetime import datetime, timedelta
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.ticket import Ticket, TicketStatusEnum, TicketPriority
from app.models.call import CallLog, Campaign

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard")
async def dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    client_id = current_user.client_id

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today - timedelta(days=today.weekday())

    total_tickets = (await db.execute(select(func.count()).where(Ticket.client_id == client_id))).scalar()
    open_tickets = (await db.execute(select(func.count()).where(Ticket.client_id == client_id, Ticket.status == TicketStatusEnum.OPEN))).scalar()
    pending_tickets = (await db.execute(select(func.count()).where(Ticket.client_id == client_id, Ticket.status == TicketStatusEnum.PENDING))).scalar()
    resolved_today = (await db.execute(select(func.count()).where(
        Ticket.client_id == client_id, Ticket.status == TicketStatusEnum.RESOLVED, Ticket.resolved_at >= today
    ))).scalar()
    created_today = (await db.execute(select(func.count()).where(
        Ticket.client_id == client_id, Ticket.created_at >= today
    ))).scalar()
    total_calls = (await db.execute(select(func.count()).where(CallLog.client_id == client_id))).scalar()
    calls_today = (await db.execute(select(func.count()).where(
        CallLog.client_id == client_id, CallLog.created_at >= today
    ))).scalar()

    result = await db.execute(
        select(Ticket.status, func.count().label("count"))
        .where(Ticket.client_id == client_id)
        .group_by(Ticket.status)
    )
    status_dist = [{"status": r[0], "count": r[1]} for r in result.fetchall()]

    result = await db.execute(
        select(Ticket.priority, func.count().label("count"))
        .where(Ticket.client_id == client_id)
        .group_by(Ticket.priority)
    )
    priority_dist = [{"priority": r[0], "count": r[1]} for r in result.fetchall()]

    result = await db.execute(
        select(
            func.date(Ticket.created_at).label("date"),
            func.count().label("count")
        )
        .where(Ticket.client_id == client_id, Ticket.created_at >= week_start)
        .group_by(func.date(Ticket.created_at))
        .order_by(func.date(Ticket.created_at))
    )
    weekly_trend = [{"date": str(r[0]), "count": r[1]} for r in result.fetchall()]

    return {
        "tickets": {
            "total": total_tickets,
            "open": open_tickets,
            "pending": pending_tickets,
            "resolved_today": resolved_today,
            "created_today": created_today,
        },
        "calls": {
            "total": total_calls,
            "today": calls_today,
        },
        "status_distribution": status_dist,
        "priority_distribution": priority_dist,
        "weekly_trend": weekly_trend,
    }


@router.get("/tickets")
async def ticket_report(
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[int] = None,
    department_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Ticket).where(Ticket.client_id == current_user.client_id)
    if from_date:
        q = q.where(Ticket.created_at >= from_date)
    if to_date:
        q = q.where(Ticket.created_at <= to_date)
    if status:
        q = q.where(Ticket.status == status)
    if priority:
        q = q.where(Ticket.priority == priority)
    if assigned_to:
        q = q.where(Ticket.assigned_to == assigned_to)
    if department_id:
        q = q.where(Ticket.department_id == department_id)

    result = await db.execute(q.order_by(Ticket.created_at.desc()))
    return result.scalars().all()


@router.get("/calls")
async def call_report(
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    agent_id: Optional[int] = None,
    campaign_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(CallLog).where(CallLog.client_id == current_user.client_id)
    if from_date:
        q = q.where(CallLog.created_at >= from_date)
    if to_date:
        q = q.where(CallLog.created_at <= to_date)
    if agent_id:
        q = q.where(CallLog.agent_id == agent_id)
    if campaign_id:
        q = q.where(CallLog.campaign_id == campaign_id)
    if current_user.role == UserRole.AGENT:
        q = q.where(CallLog.agent_id == current_user.id)

    result = await db.execute(q.order_by(CallLog.created_at.desc()))
    return result.scalars().all()


@router.get("/agent-productivity")
async def agent_productivity(
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(
        Ticket.assigned_to,
        func.count().label("total_tickets"),
        func.sum(case((Ticket.status == TicketStatusEnum.RESOLVED, 1), else_=0)).label("resolved"),
        func.sum(case((Ticket.status == TicketStatusEnum.CLOSED, 1), else_=0)).label("closed"),
    ).where(Ticket.client_id == current_user.client_id).group_by(Ticket.assigned_to)

    if from_date:
        q = q.where(Ticket.created_at >= from_date)
    if to_date:
        q = q.where(Ticket.created_at <= to_date)

    result = await db.execute(q)
    return [{"agent_id": r[0], "total": r[1], "resolved": r[2], "closed": r[3]} for r in result.fetchall()]
