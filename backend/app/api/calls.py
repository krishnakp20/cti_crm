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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Campaign).where(Campaign.client_id == current_user.client_id)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset((page-1)*limit).limit(limit).order_by(Campaign.created_at.desc()))
    return {"total": total, "items": result.scalars().all()}


@router.post("/campaigns")
async def create_campaign(req: CampaignCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    campaign = Campaign(client_id=current_user.client_id, created_by=current_user.id, **req.model_dump(exclude_none=True))
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/upload")
async def upload_calling_data(
    campaign_id: int,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import io
    content = await file.read()

    batch = UploadBatch(
        client_id=current_user.client_id,
        campaign_id=campaign_id,
        file_name=file.filename,
        file_url="",
        status="processing",
        uploaded_by=current_user.id,
    )
    db.add(batch)
    await db.flush()

    try:
        import pandas as pd
        df = pd.read_csv(io.BytesIO(content)) if file.filename.endswith(".csv") else pd.read_excel(io.BytesIO(content))
        records = []
        for _, row in df.iterrows():
            record = UploadRecord(
                batch_id=batch.id,
                client_id=current_user.client_id,
                campaign_id=campaign_id,
                name=str(row.get("name", row.get("Name", ""))),
                mobile=str(row.get("mobile", row.get("Mobile", row.get("phone", "")))),
                alternate_mobile=str(row.get("alternate_mobile", "")) or None,
                email=str(row.get("email", "")) or None,
                city=str(row.get("city", "")) or None,
                state=str(row.get("state", "")) or None,
                priority=int(row.get("priority", 0)),
                remarks=str(row.get("remarks", "")) or None,
            )
            records.append(record)
            db.add(record)

        batch.total_records = len(records)
        batch.status = "completed"
        batch.completed_at = datetime.utcnow()
    except Exception as e:
        batch.status = "failed"
        batch.error_log = str(e)

    await db.commit()

    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign and campaign.campaign_type == CampaignType.PREDICTIVE:
        background_tasks.add_task(push_to_dialer, campaign_id, batch.id)

    return {"batch_id": batch.id, "total": batch.total_records, "status": batch.status}


@router.get("/logs")
async def list_call_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    agent_id: Optional[int] = None,
    campaign_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
