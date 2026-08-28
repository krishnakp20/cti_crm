from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional
from datetime import datetime, date
import os
import csv
import io

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.cdr import CallRecord
from app.models.user import User, UserRole
from app.services.ami import ami_client

router = APIRouter(prefix="/cdr", tags=["cdr"])

RECORDINGS_DIR = os.getenv("RECORDINGS_DIR", "/var/spool/asterisk/monitor")


def _has_recording(r: CallRecord) -> bool:
    """Check recording_path in DB, or fallback: look for UNIQUEID.wav on disk."""
    if r.recording_path:
        path = r.recording_path if os.path.isabs(r.recording_path) else os.path.join(RECORDINGS_DIR, r.recording_path)
        return os.path.exists(path)
    # Fallback: check if file exists by uniqueid
    if r.asterisk_unique_id:
        guessed = os.path.join(RECORDINGS_DIR, f"{r.asterisk_unique_id}.wav")
        return os.path.exists(guessed)
    return False


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
        "recording_filename": r.recording_filename or (f"{r.asterisk_unique_id}.wav" if r.asterisk_unique_id else None),
        "has_recording": _has_recording(r),
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


@router.get("/export")
async def export_cdr(
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
    """Export call logs as CSV."""
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

    rows = (await db.execute(q.limit(5000))).scalars().all()

    def _fmt_dt(v):
        if not v:
            return ""
        if isinstance(v, datetime):
            return v.strftime("%Y-%m-%d %H:%M:%S")
        return str(v)

    def _fmt_dur(s):
        if not s:
            return ""
        m, sec = divmod(int(s), 60)
        return f"{m}:{sec:02d}"

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Asterisk ID", "Caller Number", "Department", "Queue",
        "Agent Name", "Agent Extension", "IVR Key",
        "Queue Start Time", "Call Start Time", "Call End Time",
        "Wait Time", "Call Duration", "Status",
        "Disposition", "Tags", "Ticket ID", "Recording",
    ])
    for r in rows:
        writer.writerow([
            r.id,
            r.asterisk_unique_id or "",
            r.caller_number or "",
            r.department or "",
            r.queue_name or "",
            r.agent_name or "",
            r.agent_extension or "",
            r.ivr_selection or "",
            _fmt_dt(r.queue_start_time),
            _fmt_dt(r.call_start_time),
            _fmt_dt(r.call_end_time),
            _fmt_dur(r.queue_duration),
            _fmt_dur(r.call_duration),
            r.call_status or "",
            r.disposition or "",
            ", ".join(r.tags or []),
            r.ticket_id or "",
            r.recording_filename or (f"{r.asterisk_unique_id}.wav" if _has_recording(r) else ""),
        ])

    output.seek(0)
    filename = f"call_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{record_id}/recording")
async def serve_recording(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rec = await db.get(CallRecord, record_id)
    if not rec:
        raise HTTPException(404, "Record not found")

    # Try stored path first, then fallback to UNIQUEID.wav
    path = None
    if rec.recording_path:
        p = rec.recording_path if os.path.isabs(rec.recording_path) else os.path.join(RECORDINGS_DIR, rec.recording_path)
        if os.path.exists(p):
            path = p
    if not path and rec.asterisk_unique_id:
        guessed = os.path.join(RECORDINGS_DIR, f"{rec.asterisk_unique_id}.wav")
        if os.path.exists(guessed):
            path = guessed

    if not path:
        raise HTTPException(404, "Recording file not found")
    fname = rec.recording_filename or os.path.basename(path)
    return FileResponse(path, media_type="audio/wav", filename=fname)
