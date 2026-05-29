from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
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


async def push_to_dialer(campaign_id: int, batch_id: int):
    pass
