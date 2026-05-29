from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from datetime import datetime
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/")
async def list_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        q = q.where(Notification.is_read == False)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    unread = (await db.execute(select(func.count()).where(Notification.user_id == current_user.id, Notification.is_read == False))).scalar()

    result = await db.execute(q.offset((page-1)*limit).limit(limit).order_by(Notification.created_at.desc()))
    return {"total": total, "unread": unread, "items": result.scalars().all()}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id)
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.commit()
    return {"message": "Marked as read"}


@router.post("/read-all")
async def mark_all_read(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Notification).where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.commit()
    return {"message": "All marked as read"}
