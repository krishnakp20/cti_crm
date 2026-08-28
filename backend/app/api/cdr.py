from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional
from datetime import datetime, date
import os

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.cdr import CallRecord
from app.models.user import User, UserRole
from app.services.ami import ami_client

router = APIRouter(prefix="/cdr", tags=["cdr"])

RECORDINGS_DIR = os.getenv("RECORDINGS_DIR", "/var/spool/asterisk/monitor")


def _record_dict(r: CallRecord) -> dict:
    return {
        "id": r.id,
        "asterisk_unique_id": r.asterisk_unique_id,
        "caller_number": r.caller_number,
        "department": r.department,
        "queue_name": r.queue_name,
        "agent_id": r.agent_id,
        "agent_name": r.agent_name,
        "agent_extension": r.agent_extension,
        "team_id": r.team_id,
        "ivr_selection": r.ivr_selection,
        "queue_start_time": r.queue_start_time,
        "call_start_time": r.call_start_time,
        "call_end_time": r.call_end_time,
        "queue_duration": r.queue_duration,
        "call_duration": r.call_duration,
        "call_status": r.call_status,
        "disposition": r.disposition,
        "call_summary": r.call_summary,
        "tags": r.tags or [],
        "ticket_id": r.ticket_id,
        "recording_filename": r.recording_filename,
        "has_recording": bool(r.recording_path),
        "created_at": r.created_at,
    }


@router.get("")
async def list_cdr(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    department: Optional[str] = None,
    agent_id: Optional[int] = None,
    call_status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    client_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(CallRecord).order_by(CallRecord.created_at.desc())

    if current_user.role not in (UserRole.ADMIN,) and current_user.client_id:
        q = q.where(CallRecord.client_id == current_user.client_id)
    if client_id:
        q = q.where(CallRecord.client_id == client_id)
    if department:
        q = q.where(CallRecord.department == department)
    if agent_id:
        q = q.where(CallRecord.agent_id == agent_id)
    if call_status:
        q = q.where(CallRecord.call_status == call_status)
    if date_from:
        q = q.where(CallRecord.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(CallRecord.created_at <= datetime.combine(date_to, datetime.max.time()))
    if search:
        q = q.where(or_(
            CallRecord.caller_number.ilike(f"%{search}%"),
            CallRecord.agent_name.ilike(f"%{search}%"),
        ))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    rows = (await db.execute(q.offset((page - 1) * limit).limit(limit))).scalars().all()

    return {"total": total, "page": page, "limit": limit, "items": [_record_dict(r) for r in rows]}


@router.get("/live")
async def live_state(current_user: User = Depends(get_current_user)):
    """Current active calls + queue count from AMI."""
    return ami_client.get_live_state()


@router.get("/stats")
async def cdr_stats(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    client_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(CallRecord)
    if current_user.role not in (UserRole.ADMIN,) and current_user.client_id:
        q = q.where(CallRecord.client_id == current_user.client_id)
    if client_id:
        q = q.where(CallRecord.client_id == client_id)
    if date_from:
        q = q.where(CallRecord.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(CallRecord.created_at <= datetime.combine(date_to, datetime.max.time()))

    rows = (await db.execute(q)).scalars().all()

    answered = [r for r in rows if r.call_status == "completed"]
    avg_queue = int(sum(r.queue_duration or 0 for r in answered) / len(answered)) if answered else 0
    avg_talk = int(sum(r.call_duration or 0 for r in answered) / len(answered)) if answered else 0

    by_dept: dict = {}
    for r in rows:
        d = r.department or "Unknown"
        by_dept[d] = by_dept.get(d, 0) + 1

    return {
        "total": len(rows),
        "answered": len(answered),
        "abandoned": sum(1 for r in rows if r.call_status == "abandoned"),
        "no_answer": sum(1 for r in rows if r.call_status == "no_answer"),
        "avg_queue_seconds": avg_queue,
        "avg_talk_seconds": avg_talk,
        "by_department": by_dept,
    }


@router.get("/{record_id}")
async def get_record(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rec = await db.get(CallRecord, record_id)
    if not rec:
        raise HTTPException(404, "Record not found")
    return _record_dict(rec)


@router.patch("/{record_id}/wrapup")
async def update_wrapup(
    record_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Called by agent after wrap-up to attach disposition/tags/ticket."""
    rec = await db.get(CallRecord, record_id)
    if not rec:
        raise HTTPException(404, "Record not found")
    if body.get("disposition") is not None:
        rec.disposition = body["disposition"]
    if body.get("call_summary") is not None:
        rec.call_summary = body["call_summary"]
    if body.get("tags") is not None:
        rec.tags = body["tags"]
    if body.get("ticket_id") is not None:
        rec.ticket_id = body["ticket_id"]
    await db.commit()
    return {"ok": True}


@router.get("/{record_id}/recording")
async def serve_recording(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rec = await db.get(CallRecord, record_id)
    if not rec or not rec.recording_path:
        raise HTTPException(404, "No recording found")
    path = rec.recording_path
    if not os.path.isabs(path):
        path = os.path.join(RECORDINGS_DIR, path)
    if not os.path.exists(path):
        raise HTTPException(404, "Recording file not found on server")
    return FileResponse(path, media_type="audio/wav", filename=rec.recording_filename or "recording.wav")
