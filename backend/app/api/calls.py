from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User, UserRole
from app.models.call import Campaign, CampaignType, CampaignStatus, CallLog, UploadBatch, UploadRecord, CallbackSchedule

router = APIRouter(prefix="/calls", tags=["calls"])


class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    campaign_type: CampaignType
    settings: Optional[dict] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    client_id: Optional[int] = None  # admin can specify; non-admin uses their own
    dial_prefix: Optional[str] = None      # prepended to mobile before dialing e.g. "0"
    dial_context: Optional[str] = None     # Asterisk dialplan context, default from-internal
    caller_id_name: Optional[str] = None   # e.g. "Sheesha Green"
    caller_id_number: Optional[str] = None # e.g. "02212345678"


class CallbackCreate(BaseModel):
    customer_name: Optional[str] = None
    phone_number: str
    scheduled_at: datetime
    notes: Optional[str] = None
    ticket_id: Optional[int] = None
    call_log_id: Optional[int] = None


class CallLogCreate(BaseModel):
    phone_number: str
    direction: str = "outbound"
    campaign_id: Optional[int] = None
    upload_record_id: Optional[int] = None
    dialer_call_id: Optional[str] = None


@router.get("/campaigns")
async def list_campaigns(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    client_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.user import UserRole
    q = select(Campaign)
    if current_user.role == UserRole.ADMIN:
        if client_id:
            q = q.where(Campaign.client_id == client_id)
    else:
        q = q.where(Campaign.client_id == current_user.client_id)
    if status:
        q = q.where(Campaign.status == status)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*limit).limit(limit).order_by(Campaign.created_at.desc()))
    return {"total": total, "items": result.scalars().all()}


@router.post("/campaigns")
async def create_campaign(req: CampaignCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.user import UserRole
    # Admin can pass client_id explicitly; regular users always use their own
    if current_user.role == UserRole.ADMIN and req.client_id:
        client_id = req.client_id
    elif current_user.client_id:
        client_id = current_user.client_id
    else:
        raise HTTPException(400, "No client associated with your account. Ask a superadmin to assign you to a client first.")
    data = req.model_dump(exclude_none=True)
    data.pop("client_id", None)
    campaign = Campaign(client_id=client_id, created_by=current_user.id, **data)
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


class CampaignStatusUpdate(BaseModel):
    status: str  # draft | active | paused | completed | archived

@router.patch("/campaigns/{campaign_id}/status")
async def update_campaign_status(
    campaign_id: int,
    req: CampaignStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(update(Campaign).where(Campaign.id == campaign_id).values(status=req.status))
    await db.commit()
    return {"status": req.status}


MOBILE_HINTS = {"mobile", "phone", "number", "contact", "cell", "mob", "phoneno", "phone_no", "mobileno"}
NAME_HINTS   = {"name", "full_name", "customer_name", "contact_name", "cust_name", "fullname"}

def _detect_field(columns: list[str], hints: set) -> str | None:
    for col in columns:
        if col.lower().strip().replace(" ", "_") in hints:
            return col
    return None


@router.post("/campaigns/{campaign_id}/preview")
async def preview_csv(
    campaign_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Parse CSV headers + first 5 rows for admin confirmation before import."""
    import io
    import pandas as pd
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content)) if file.filename.lower().endswith(".csv") else pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Cannot parse file: {e}")
    cols = list(df.columns)
    preview = df.head(5).fillna("").astype(str).to_dict(orient="records")
    return {
        "columns": cols,
        "detected_mobile": _detect_field(cols, MOBILE_HINTS),
        "detected_name": _detect_field(cols, NAME_HINTS),
        "preview_rows": preview,
        "total_rows": len(df),
        "filename": file.filename,
        # Send raw bytes b64 so frontend can re-send without re-selecting file
        "file_b64": __import__("base64").b64encode(content).decode(),
    }


@router.post("/campaigns/{campaign_id}/upload")
async def upload_calling_data(
    campaign_id: int,
    file: UploadFile = File(...),
    mobile_field: str = Query("mobile"),
    name_field: str = Query("name"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import io, pandas as pd
    content = await file.read()

    # Resolve client_id from the campaign (works for admin who has no client_id)
    camp = (await db.execute(select(Campaign).where(Campaign.id == campaign_id))).scalar_one_or_none()
    if not camp:
        raise HTTPException(404, "Campaign not found")
    effective_client_id = camp.client_id or current_user.client_id

    batch = UploadBatch(
        client_id=effective_client_id,
        campaign_id=campaign_id,
        file_name=file.filename,
        file_url="",
        status="processing",
        uploaded_by=current_user.id,
    )
    db.add(batch)
    await db.flush()

    try:
        df = pd.read_csv(io.BytesIO(content)) if file.filename.lower().endswith(".csv") else pd.read_excel(io.BytesIO(content))
        df = df.fillna("").astype(str)
        cols = list(df.columns)
        # Store contact_fields on campaign (exclude mobile/name cols)
        extra_cols = [c for c in cols if c not in (mobile_field, name_field)]
        await db.execute(
            update(Campaign).where(Campaign.id == campaign_id).values(
                contact_fields=extra_cols,
                mobile_field=mobile_field,
                name_field=name_field,
            )
        )
        skipped = 0
        for _, row in df.iterrows():
            mobile = row.get(mobile_field, "").strip()
            if not mobile:
                skipped += 1
                continue
            # store all other columns in extra_data
            extra = {c: row.get(c, "") for c in extra_cols if row.get(c, "")}
            record = UploadRecord(
                batch_id=batch.id,
                client_id=effective_client_id,
                campaign_id=campaign_id,
                name=row.get(name_field, "").strip() or mobile,
                mobile=mobile,
                extra_data=extra if extra else None,
            )
            db.add(record)

        batch.total_records = len(df) - skipped
        batch.status = "completed"
        batch.completed_at = datetime.utcnow()
    except Exception as e:
        batch.status = "failed"
        batch.error_log = str(e)

    await db.commit()
    return {"batch_id": batch.id, "total": batch.total_records, "status": batch.status}


@router.get("/logs")
async def list_call_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    agent_id: Optional[int] = None,
    campaign_id: Optional[int] = None,
    client_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == UserRole.ADMIN and client_id:
        q = select(CallLog).where(CallLog.client_id == client_id)
    elif current_user.role == UserRole.ADMIN:
        q = select(CallLog)
    else:
        q = select(CallLog).where(CallLog.client_id == current_user.client_id)
    if agent_id:
        q = q.where(CallLog.agent_id == agent_id)
    if campaign_id:
        q = q.where(CallLog.campaign_id == campaign_id)
    if current_user.role == UserRole.AGENT:
        q = q.where(CallLog.agent_id == current_user.id)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*limit).limit(limit).order_by(CallLog.created_at.desc()))
    return {"total": total, "items": result.scalars().all()}


@router.post("/logs")
async def create_call_log(req: CallLogCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    log = CallLog(client_id=current_user.client_id, agent_id=current_user.id, **req.model_dump(exclude_none=True))
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


@router.patch("/logs/{log_id}")
async def update_call_log(log_id: int, data: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(CallLog).where(CallLog.id == log_id).values(**data))
    await db.commit()
    return {"message": "Updated"}


@router.get("/callbacks")
async def list_callbacks(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(CallbackSchedule).where(CallbackSchedule.client_id == current_user.client_id)
    if current_user.role == UserRole.AGENT:
        q = q.where(CallbackSchedule.agent_id == current_user.id)
    result = await db.execute(q.order_by(CallbackSchedule.scheduled_at))
    return result.scalars().all()


@router.post("/callbacks")
async def create_callback(req: CallbackCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cb = CallbackSchedule(client_id=current_user.client_id, agent_id=current_user.id, **req.model_dump(exclude_none=True))
    db.add(cb)
    await db.commit()
    await db.refresh(cb)
    return cb


@router.post("/dialer/webhook")
async def dialer_webhook(payload: dict, db: AsyncSession = Depends(get_db)):
    call_id = payload.get("call_id") or payload.get("uniqueid")
    status = payload.get("status") or payload.get("disposition")
    duration = payload.get("duration")
    recording_url = payload.get("recording_url")

    if call_id:
        await db.execute(
            update(CallLog).where(CallLog.dialer_call_id == str(call_id)).values(
                status=status,
                duration=duration,
                recording_url=recording_url,
                ended_at=datetime.utcnow(),
            )
        )
        await db.commit()
    return {"status": "ok"}


@router.post("/dialer/call-arrived")
async def call_arrived(payload: dict, db: AsyncSession = Depends(get_db)):
    """
    ViciBox AGI calls this when a call is connected to an agent.
    Payload: { agent_extension, caller_id, caller_name, uniqueid, campaign_id? }
    Pushes a WebSocket 'call_arrive' event to the matching agent's browser.
    """
    from app.websocket.manager import manager

    extension = payload.get("agent_extension") or payload.get("extension")
    caller_id = payload.get("caller_id") or payload.get("callerid") or payload.get("phone")
    caller_name = payload.get("caller_name") or payload.get("callername") or ""
    uniqueid = payload.get("uniqueid") or payload.get("call_id") or ""
    campaign_id = payload.get("campaign_id")
    client_id = payload.get("client_id")

    if not extension or not caller_id:
        return {"status": "error", "message": "agent_extension and caller_id are required"}

    # Find agent by extension
    q = select(User).where(User.extension == extension, User.is_active == True)
    result = await db.execute(q)
    agent = result.scalar_one_or_none()

    if not agent:
        return {"status": "error", "message": f"No active agent with extension {extension}"}

    # Look up upload record by phone for pre-filled data
    customer_data: dict = {}
    clean_phone = caller_id.replace("+91", "").replace("+", "").replace(" ", "").replace("-", "").strip()
    from app.models.call import UploadRecord
    phone_q = select(UploadRecord).where(
        UploadRecord.mobile.like(f"%{clean_phone[-10:]}%") if len(clean_phone) >= 10 else UploadRecord.mobile == clean_phone
    ).order_by(UploadRecord.created_at.desc()).limit(1)
    rec_result = await db.execute(phone_q)
    record = rec_result.scalar_one_or_none()
    if record:
        customer_data = {
            "name": record.name,
            "email": record.email or "",
            "city": record.city or "",
            "remarks": record.remarks or "",
        }

    # Find agent's assigned form (client's active form for category=ticket)
    form_data = None
    if agent.client_id:
        from app.models.form import Form, FormField
        form_q = select(Form).where(
            Form.client_id == agent.client_id,
            Form.is_active == True,
            Form.category == "ticket",
        ).order_by(Form.created_at.desc()).limit(1)
        form_res = await db.execute(form_q)
        form = form_res.scalar_one_or_none()
        if form:
            fields_res = await db.execute(
                select(FormField).where(FormField.form_id == form.id).order_by(FormField.order)
            )
            fields = fields_res.scalars().all()
            form_data = {
                "id": form.id,
                "name": form.name,
                "fields": [
                    {
                        "id": f.id,
                        "label": f.label,
                        "field_name": f.field_name,
                        "field_type": f.field_type.value if hasattr(f.field_type, 'value') else str(f.field_type),
                        "placeholder": f.placeholder,
                        "options": f.options,
                        "is_required": f.is_required,
                        "order": f.order,
                    }
                    for f in fields
                ],
            }

    # Push WebSocket event to agent's browser
    ws_payload = {
        "type": "call_arrive",
        "uniqueid": uniqueid,
        "caller_id": caller_id,
        "caller_name": caller_name,
        "campaign_id": campaign_id,
        "customer": customer_data,
        "form": form_data,
    }
    await manager.send_to_user(agent.id, ws_payload)

    # Create a call log entry
    log = CallLog(
        client_id=agent.client_id,
        agent_id=agent.id,
        phone_number=caller_id,
        direction="inbound",
        dialer_call_id=uniqueid,
        campaign_id=campaign_id,
        status="answered",
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    return {"status": "ok", "agent_id": agent.id, "call_log_id": log.id}


@router.get("/dialer/vd-hook")
async def vicidial_start_call_hook(
    request: "Request",
    db: AsyncSession = Depends(get_db),
):
    """
    ViciDial Start Call URL hook (GET) — captures ALL query params ViciDial sends.
    Set in campaign: Start Call URL = http://YOUR_IP:8001/api/v1/calls/dialer/vd-hook?agent=--A--&phone=--D--&name=--N--&call_id=--X--&campaign=--C--
    """
    from app.websocket.manager import manager
    import logging

    all_params = dict(request.query_params)
    logging.warning(f"[VD-HOOK] ALL PARAMS FROM VICIDIAL: {all_params}")
    print(f"\n{'='*60}\n[VD-HOOK] ViciDial sent these params:\n{all_params}\n{'='*60}\n")

    agent = all_params.get("agent", "")
    phone = all_params.get("phone", "")
    name = all_params.get("name", "")
    call_id = all_params.get("call_id", "")
    campaign = all_params.get("campaign", "")

    # Find agent by dialer_user (ViciDial login) first, then fall back to extension
    q = select(User).where(User.dialer_user == agent, User.is_active == True)
    result = await db.execute(q)
    db_agent = result.scalars().first()

    if not db_agent:
        return {"status": "error", "message": f"No CTI agent mapped to ViciDial user '{agent}'. Set your Dialer User ID in Agent Panel settings."}

    # Customer lookup by phone
    customer_data: dict = {}
    clean_phone = phone.replace("+91", "").replace("+", "").replace(" ", "").replace("-", "").strip()
    from app.models.call import UploadRecord
    phone_q = select(UploadRecord).where(
        UploadRecord.mobile.like(f"%{clean_phone[-10:]}%") if len(clean_phone) >= 10 else UploadRecord.mobile == clean_phone
    ).order_by(UploadRecord.created_at.desc()).limit(1)
    rec_result = await db.execute(phone_q)
    record = rec_result.scalar_one_or_none()
    if record:
        customer_data = {"name": record.name, "email": record.email or "", "city": record.city or ""}
    elif name:
        customer_data = {"name": name}

    # Find active ticket form for agent's client
    form_data = None
    if db_agent.client_id:
        from app.models.form import Form, FormField
        form_res = await db.execute(
            select(Form).where(Form.client_id == db_agent.client_id, Form.is_active == True, Form.category == "ticket")
            .order_by(Form.created_at.desc()).limit(1)
        )
        form = form_res.scalar_one_or_none()
        if form:
            fields_res = await db.execute(
                select(FormField).where(FormField.form_id == form.id).order_by(FormField.order)
            )
            fields = fields_res.scalars().all()
            form_data = {
                "id": form.id, "name": form.name,
                "fields": [
                    {
                        "id": f.id, "label": f.label, "field_name": f.field_name,
                        "field_type": f.field_type.value if hasattr(f.field_type, "value") else str(f.field_type),
                        "placeholder": f.placeholder, "options": f.options,
                        "is_required": f.is_required, "order": f.order,
                    }
                    for f in fields
                ],
            }

    await manager.send_to_user(db_agent.id, {
        "type": "call_arrive",
        "uniqueid": call_id,
        "caller_id": phone,
        "caller_name": name,
        "campaign_id": campaign or None,
        "customer": customer_data,
        "form": form_data,
    })

    log = CallLog(
        client_id=db_agent.client_id, agent_id=db_agent.id,
        phone_number=phone, direction="inbound", dialer_call_id=call_id or None,
        status="answered",
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return {"status": "ok", "agent_id": db_agent.id, "call_log_id": log.id}


@router.patch("/dialer/set-dialer-user")
async def set_dialer_user(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Agent sets their ViciDial agent user ID."""
    du = data.get("dialer_user", "").strip()
    await db.execute(update(User).where(User.id == current_user.id).values(dialer_user=du or None))
    await db.commit()
    return {"status": "ok", "dialer_user": du or None}


@router.get("/dialer/agent-status")
async def agent_dialer_status(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Returns the current agent's extension and dialer config."""
    return {
        "agent_id": current_user.id,
        "extension": current_user.extension,
        "dialer_user": current_user.dialer_user,
        "name": current_user.full_name,
        "role": current_user.role,
    }


@router.patch("/dialer/set-extension")
async def set_extension(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Agent sets their own ViciBox extension number."""
    ext = data.get("extension", "").strip()
    await db.execute(
        update(User).where(User.id == current_user.id).values(extension=ext or None)
    )
    await db.commit()
    return {"status": "ok", "extension": ext or None}


async def push_to_dialer(campaign_id: int, batch_id: int):
    pass


# ── Campaign Contacts (Manual Dialer) ─────────────────────────────────────────

@router.get("/campaigns/{campaign_id}/contacts")
async def list_contacts(
    campaign_id: int,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(UploadRecord).where(
        UploadRecord.campaign_id == campaign_id,
        UploadRecord.client_id == current_user.client_id,
    )
    if status:
        q = q.where(UploadRecord.call_status == status)
    # Callbacks first, then pending, then called
    from sqlalchemy import case
    q = q.order_by(
        case(
            (UploadRecord.call_status == "callback", 0),
            (UploadRecord.call_status == "pending", 1),
            else_=2,
        ),
        UploadRecord.created_at,
    )
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    contacts = result.scalars().all()

    # Also return campaign field names
    camp = (await db.execute(select(Campaign).where(Campaign.id == campaign_id))).scalar_one_or_none()

    return {
        "total": total,
        "contact_fields": camp.contact_fields if camp else [],
        "items": [
            {
                "id": c.id,
                "name": c.name,
                "mobile": c.mobile,
                "status": c.call_status,
                "call_count": c.call_count,
                "last_called_at": c.last_called_at.isoformat() if c.last_called_at else None,
                "extra_data": c.extra_data or {},
                "remarks": c.remarks,
            }
            for c in contacts
        ],
    }


class ContactStatusUpdate(BaseModel):
    status: str  # pending | called | callback | dnc | failed
    remarks: Optional[str] = None
    callback_at: Optional[datetime] = None


@router.patch("/campaigns/{campaign_id}/contacts/{contact_id}")
async def update_contact_status(
    campaign_id: int,
    contact_id: int,
    req: ContactStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rec = (await db.execute(
        select(UploadRecord).where(
            UploadRecord.id == contact_id,
            UploadRecord.campaign_id == campaign_id,
            UploadRecord.client_id == current_user.client_id,
        )
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Contact not found")
    rec.call_status = req.status
    rec.call_count = (rec.call_count or 0) + 1
    rec.last_called_at = datetime.utcnow()
    if req.remarks:
        rec.remarks = req.remarks
    await db.commit()
    return {"status": "ok"}


# ── AMI Originate (outbound click-to-call) ───────────────────────────────────

class OriginateRequest(BaseModel):
    contact_id: int
    campaign_id: int
    destination: str    # customer mobile number
    caller_id: Optional[str] = None  # override caller ID shown to customer


@router.post("/originate")
async def originate_call(
    req: OriginateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Agent clicks Dial → Asterisk originates a call:
    1. Rings agent's WebRTC extension
    2. When agent answers → Asterisk dials customer number
    """
    from app.services.ami import ami_client
    from app.models.cdr import CallRecord

    ext = current_user.extension
    if not ext:
        raise HTTPException(400, "No extension configured. Set it in Agent Panel settings.")

    # Normalize destination
    dest = req.destination.strip().replace(" ", "").replace("-", "")
    if not dest:
        raise HTTPException(400, "Invalid destination number")

    # Fetch contact for pre-fill data
    contact = (await db.execute(
        select(UploadRecord).where(UploadRecord.id == req.contact_id)
    )).scalar_one_or_none()

    # Fetch campaign dial settings
    camp = (await db.execute(
        select(Campaign).where(Campaign.id == req.campaign_id)
    )).scalar_one_or_none()
    dial_prefix = (camp.dial_prefix or "").strip() if camp else ""
    dial_context = (camp.dial_context or "from-internal").strip() if camp else "from-internal"
    cid_name = (camp.caller_id_name or current_user.full_name).strip() if camp else current_user.full_name
    cid_number = (camp.caller_id_number or "").strip() if camp else ""

    # Apply prefix to destination
    dial_dest = f"{dial_prefix}{dest}"

    # Unique call ID
    import time, uuid
    call_uid = f"ob-{int(time.time())}-{uuid.uuid4().hex[:6]}"
    # Priority: request override → campaign caller ID → agent extension
    caller_id_num = req.caller_id or cid_number or ext

    # AMI Originate — send as raw lines so multiple Variable: headers work
    ami_lines = (
        f"Action: Originate\r\n"
        f"Channel: PJSIP/{ext}\r\n"
        f"Context: {dial_context}\r\n"
        f"Exten: {dial_dest}\r\n"
        f"Priority: 1\r\n"
        f"Timeout: 30000\r\n"
        f'CallerID: "{cid_name}" <{caller_id_num}>\r\n'
        f"Variable: OUTBOUND_AGENT={ext}\r\n"
        f"Variable: OUTBOUND_CONTACT={req.contact_id}\r\n"
        f"Variable: OUTBOUND_CAMPAIGN={req.campaign_id}\r\n"
        f"ActionID: {call_uid}\r\n"
        f"Async: true\r\n"
        f"\r\n"
    )
    if ami_client._connected and ami_client.writer:
        ami_client.writer.write(ami_lines.encode())
        await ami_client.writer.drain()

    # Create outbound CDR row
    cdr = CallRecord(
        asterisk_unique_id=call_uid,
        caller_number=dest,
        agent_id=current_user.id,
        agent_name=current_user.full_name,
        agent_extension=ext,
        direction="outbound",
        campaign_id=req.campaign_id,
        upload_record_id=req.contact_id,
        call_status="initiated",
        call_start_time=datetime.utcnow(),
        client_id=current_user.client_id,
    )
    db.add(cdr)

    # Mark contact as being called
    if contact:
        contact.call_count = (contact.call_count or 0) + 1
        contact.last_called_at = datetime.utcnow()
        contact.call_status = "called"

    await db.commit()

    # Push call_arrive to agent's own browser so the form pops up
    from app.websocket.manager import manager
    contact_data = {}
    if contact:
        contact_data = {
            "name": contact.name,
            "mobile": contact.mobile,
            **(contact.extra_data or {}),
        }

    # Load agent's form
    form_data = None
    if current_user.client_id:
        from app.models.form import Form, FormField
        form = (await db.execute(
            select(Form).where(Form.client_id == current_user.client_id, Form.is_active == True)
            .order_by(Form.created_at.desc()).limit(1)
        )).scalar_one_or_none()
        if form:
            fields = (await db.execute(
                select(FormField).where(FormField.form_id == form.id).order_by(FormField.order)
            )).scalars().all()
            form_data = {
                "id": form.id, "name": form.name,
                "fields": [
                    {"id": f.id, "label": f.label, "field_name": f.field_name,
                     "field_type": f.field_type.value if hasattr(f.field_type, "value") else str(f.field_type),
                     "placeholder": f.placeholder, "options": f.options,
                     "is_required": f.is_required, "order": f.order}
                    for f in fields
                ],
            }

    campaign_contact_fields = []
    if contact and contact.extra_data:
        campaign_contact_fields = [
            {"key": k, "value": v} for k, v in contact.extra_data.items() if v
        ]

    await manager.send_to_user(current_user.id, {
        "type": "call_arrive",
        "uniqueid": call_uid,
        "caller_id": dest,
        "caller_name": contact.name if contact else dest,
        "direction": "outbound",
        "campaign_id": req.campaign_id,
        "contact_id": req.contact_id,
        "campaign_contact_fields": campaign_contact_fields,
        "customer": {"name": contact.name if contact else "", "mobile": dest},
        "form": form_data,
    })

    return {"status": "ok", "call_uid": call_uid}
