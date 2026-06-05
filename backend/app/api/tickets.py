from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, and_, or_
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db, AsyncSessionLocal
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.ticket import Ticket, TicketComment, TicketLog, TicketAttachment, TicketStatusEnum, TicketPriority
from app.models.alert import AlertTrigger
from app.utils.ticket_number import generate_ticket_number

router = APIRouter(prefix="/tickets", tags=["tickets"])


class TicketCreateRequest(BaseModel):
    subject: str
    description: Optional[str] = None
    priority: TicketPriority = TicketPriority.MEDIUM
    form_id: Optional[int] = None
    form_data: Optional[dict] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_mobile: Optional[str] = None
    department_id: Optional[int] = None
    team_id: Optional[int] = None
    assigned_to: Optional[int] = None
    tags: Optional[List[str]] = None
    call_log_id: Optional[int] = None
    client_id: Optional[int] = None  # admin can specify client


class TicketUpdateRequest(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[TicketPriority] = None
    status: Optional[TicketStatusEnum] = None
    assigned_to: Optional[int] = None
    department_id: Optional[int] = None
    team_id: Optional[int] = None
    tags: Optional[List[str]] = None
    form_data: Optional[dict] = None


class CommentRequest(BaseModel):
    content: str
    is_internal: bool = False


@router.get("/")
async def list_tickets(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[int] = None,
    department_id: Optional[int] = None,
    search: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Ticket)
    if current_user.role != UserRole.ADMIN:
        q = q.where(Ticket.client_id == current_user.client_id)
    if current_user.role == UserRole.AGENT:
        q = q.where(or_(Ticket.assigned_to == current_user.id, Ticket.created_by == current_user.id))
    if status:
        q = q.where(Ticket.status == status)
    if priority:
        q = q.where(Ticket.priority == priority)
    if assigned_to:
        q = q.where(Ticket.assigned_to == assigned_to)
    if department_id:
        q = q.where(Ticket.department_id == department_id)
    if search:
        q = q.where(or_(
            Ticket.subject.ilike(f"%{search}%"),
            Ticket.ticket_number.ilike(f"%{search}%"),
            Ticket.customer_name.ilike(f"%{search}%"),
            Ticket.customer_email.ilike(f"%{search}%"),
            Ticket.customer_mobile.ilike(f"%{search}%"),
        ))
    if from_date:
        q = q.where(Ticket.created_at >= from_date)
    if to_date:
        q = q.where(Ticket.created_at <= to_date)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    q = q.offset((page - 1) * limit).limit(limit).order_by(Ticket.created_at.desc())
    result = await db.execute(q)
    tickets = result.scalars().all()

    return {"total": total, "page": page, "limit": limit, "items": tickets}


@router.post("/")
async def create_ticket(
    req: TicketCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Use client_id from request (admin) or from logged-in user
    effective_client_id = req.client_id or current_user.client_id
    ticket_number = await generate_ticket_number(db, effective_client_id)
    data = req.model_dump(exclude_none=True)
    data.pop('client_id', None)  # remove to avoid duplicate kwarg
    ticket = Ticket(
        ticket_number=ticket_number,
        client_id=effective_client_id,
        created_by=current_user.id,
        **data,
    )
    db.add(ticket)
    await db.flush()

    # Set SLA due date based on priority
    from app.services.alert_service import set_ticket_sla
    await set_ticket_sla(ticket, db)

    log = TicketLog(ticket_id=ticket.id, user_id=current_user.id, action="created", new_value="Ticket created")
    db.add(log)
    await db.commit()
    await db.refresh(ticket)

    background_tasks.add_task(trigger_ticket_alerts, ticket.id, AlertTrigger.TICKET_CREATED, current_user.id)
    return ticket


@router.get("/{ticket_id}")
async def get_ticket(ticket_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user.role != UserRole.ADMIN and ticket.client_id != current_user.client_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return ticket


@router.patch("/{ticket_id}")
async def update_ticket(
    ticket_id: int,
    req: TicketUpdateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    data = req.model_dump(exclude_none=True)
    old_status = ticket.status

    if data.get("status") == TicketStatusEnum.RESOLVED and not ticket.resolved_at:
        data["resolved_at"] = datetime.utcnow()
    if data.get("status") == TicketStatusEnum.CLOSED and not ticket.closed_at:
        data["closed_at"] = datetime.utcnow()
    if data.get("status") == TicketStatusEnum.REOPENED:
        data["reopened_count"] = ticket.reopened_count + 1

    if data:
        await db.execute(update(Ticket).where(Ticket.id == ticket_id).values(**data))

    for field, new_val in data.items():
        log = TicketLog(ticket_id=ticket_id, user_id=current_user.id, action=f"updated_{field}", new_value=str(new_val))
        db.add(log)

    await db.commit()

    # Fire appropriate alert based on what changed
    if data.get("status"):
        if data["status"] in (TicketStatusEnum.CLOSED, TicketStatusEnum.RESOLVED):
            trigger = AlertTrigger.TICKET_CLOSED
        else:
            trigger = AlertTrigger.TICKET_UPDATED
        background_tasks.add_task(trigger_ticket_alerts, ticket_id, trigger, current_user.id)
    elif data.get("assigned_to"):
        background_tasks.add_task(trigger_ticket_alerts, ticket_id, AlertTrigger.TICKET_ASSIGNED, current_user.id)

    return {"message": "Updated"}


@router.post("/{ticket_id}/comments")
async def add_comment(
    ticket_id: int,
    req: CommentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = TicketComment(ticket_id=ticket_id, user_id=current_user.id, content=req.content, is_internal=req.is_internal)
    db.add(comment)

    if not (await db.execute(select(Ticket).where(Ticket.id == ticket_id, Ticket.first_response_at == None))).scalar_one_or_none():
        pass
    else:
        await db.execute(update(Ticket).where(Ticket.id == ticket_id, Ticket.first_response_at == None).values(first_response_at=datetime.utcnow()))

    await db.commit()
    await db.refresh(comment)
    return comment


@router.get("/{ticket_id}/comments")
async def get_comments(ticket_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TicketComment).where(TicketComment.ticket_id == ticket_id).order_by(TicketComment.created_at))
    return result.scalars().all()


@router.get("/{ticket_id}/logs")
async def get_logs(ticket_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TicketLog).where(TicketLog.ticket_id == ticket_id).order_by(TicketLog.created_at.desc()))
    return result.scalars().all()


@router.post("/{ticket_id}/close")
async def close_ticket(ticket_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Ticket).where(Ticket.id == ticket_id).values(status=TicketStatusEnum.CLOSED, closed_at=datetime.utcnow()))
    db.add(TicketLog(ticket_id=ticket_id, user_id=current_user.id, action="closed", new_value="closed"))
    await db.commit()
    return {"message": "Ticket closed"}


@router.post("/{ticket_id}/reopen")
async def reopen_ticket(ticket_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Not found")
    await db.execute(update(Ticket).where(Ticket.id == ticket_id).values(
        status=TicketStatusEnum.REOPENED,
        reopened_count=ticket.reopened_count + 1,
    ))
    db.add(TicketLog(ticket_id=ticket_id, user_id=current_user.id, action="reopened"))
    await db.commit()
    return {"message": "Ticket reopened"}


async def trigger_ticket_alerts(ticket_id: int, trigger: AlertTrigger, user_id: int):
    """Background task — fires all matching alert rules for this ticket event."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
            ticket = result.scalar_one_or_none()
            if not ticket:
                return
            from app.services.alert_service import fire_ticket_alert
            await fire_ticket_alert(db, ticket, trigger, user_id)
    except Exception as e:
        from loguru import logger
        logger.error(f"trigger_ticket_alerts failed: {e}")
