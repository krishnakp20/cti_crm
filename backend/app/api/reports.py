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
from app.models.cdr import CallRecord

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard")
async def dashboard_stats(
    client_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Scope: admin uses provided client_id (or all); non-admin locked to own client
    if current_user.role != UserRole.ADMIN:
        client_id = current_user.client_id

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today - timedelta(days=today.weekday())

    def ticket_filter(*extra):
        filters = list(extra)
        if client_id is not None:
            filters.insert(0, Ticket.client_id == client_id)
        # Agent sees only own tickets
        if current_user.role == UserRole.AGENT:
            filters.append(Ticket.assigned_to == current_user.id)
        return filters

    def cdr_filter(*extra):
        filters = list(extra)
        if client_id is not None:
            filters.insert(0, CallRecord.client_id == client_id)
        # Agent sees only own calls
        if current_user.role == UserRole.AGENT:
            filters.append(CallRecord.agent_id == current_user.id)
        return filters

    total_tickets   = (await db.execute(select(func.count()).where(*ticket_filter()))).scalar()
    open_tickets    = (await db.execute(select(func.count()).where(*ticket_filter(Ticket.status == TicketStatusEnum.OPEN)))).scalar()
    pending_tickets = (await db.execute(select(func.count()).where(*ticket_filter(Ticket.status == TicketStatusEnum.PENDING)))).scalar()
    resolved_today  = (await db.execute(select(func.count()).where(*ticket_filter(Ticket.status == TicketStatusEnum.RESOLVED, Ticket.resolved_at >= today)))).scalar()
    created_today   = (await db.execute(select(func.count()).where(*ticket_filter(Ticket.created_at >= today)))).scalar()

    # Use CDR (call_records) for call counts — CallLog is ViciBox-only
    total_calls = (await db.execute(select(func.count(CallRecord.id)).where(*cdr_filter()))).scalar()
    calls_today = (await db.execute(select(func.count(CallRecord.id)).where(*cdr_filter(CallRecord.created_at >= today)))).scalar()

    result = await db.execute(
        select(Ticket.status, func.count().label("count"))
        .where(*ticket_filter())
        .group_by(Ticket.status)
    )
    status_dist = [{"status": r[0], "count": r[1]} for r in result.fetchall()]

    result = await db.execute(
        select(Ticket.priority, func.count().label("count"))
        .where(*ticket_filter())
        .group_by(Ticket.priority)
    )
    priority_dist = [{"priority": r[0], "count": r[1]} for r in result.fetchall()]

    result = await db.execute(
        select(
            func.date(Ticket.created_at).label("date"),
            func.count().label("count")
        )
        .where(*ticket_filter(Ticket.created_at >= week_start))
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
    q = select(Ticket)
    if current_user.role != UserRole.ADMIN:
        q = q.where(Ticket.client_id == current_user.client_id)
    # Agent sees only their own tickets
    if current_user.role == UserRole.AGENT:
        q = q.where(Ticket.assigned_to == current_user.id)
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
    client_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """CDR-based call report (replaces ViciBox CallLog)."""
    q = select(CallRecord).order_by(CallRecord.created_at.desc())

    if current_user.role == UserRole.ADMIN:
        if client_id:
            q = q.where(CallRecord.client_id == client_id)
    else:
        q = q.where(CallRecord.client_id == current_user.client_id)

    # Agent sees only their own calls
    if current_user.role == UserRole.AGENT:
        q = q.where(CallRecord.agent_id == current_user.id)
    elif agent_id:
        q = q.where(CallRecord.agent_id == agent_id)

    if from_date:
        q = q.where(CallRecord.created_at >= from_date)
    if to_date:
        q = q.where(CallRecord.created_at <= to_date)

    result = await db.execute(q)
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
    ).group_by(Ticket.assigned_to)

    if current_user.role != UserRole.ADMIN:
        q = q.where(Ticket.client_id == current_user.client_id)
    if current_user.role == UserRole.AGENT:
        q = q.where(Ticket.assigned_to == current_user.id)
    if from_date:
        q = q.where(Ticket.created_at >= from_date)
    if to_date:
        q = q.where(Ticket.created_at <= to_date)

    result = await db.execute(q)
    return [{"agent_id": r[0], "total": r[1], "resolved": r[2], "closed": r[3]} for r in result.fetchall()]
