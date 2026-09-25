from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from app.core.config import settings
from app.core.database import init_db, AsyncSessionLocal
from app.core.seed import seed_database
from app.api import auth, clients, users, tickets, forms, calls, alerts, notifications, reports, audit, teams, cdr, realtime, ivr, voicemail
from app.websocket.router import router as ws_router
from app.services.ami import ami_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CTI CRM Platform...")
    await init_db()
    async with AsyncSessionLocal() as db:
        await seed_database(db)
    # Start AMI connection (non-blocking — fails gracefully if Asterisk unreachable)
    import asyncio
    asyncio.create_task(ami_client.connect())
    asyncio.create_task(_stale_call_cleanup())
    logger.info("Application ready")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(clients.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(tickets.router, prefix=API_PREFIX)
app.include_router(forms.router, prefix=API_PREFIX)
app.include_router(calls.router, prefix=API_PREFIX)
app.include_router(alerts.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)
app.include_router(audit.router, prefix=API_PREFIX)
app.include_router(teams.router, prefix=API_PREFIX)
app.include_router(cdr.router, prefix=API_PREFIX)
app.include_router(realtime.router, prefix=API_PREFIX)
app.include_router(ivr.router, prefix=API_PREFIX)
app.include_router(voicemail.router, prefix=API_PREFIX)
app.include_router(ws_router)


async def _stale_call_cleanup():
    """Every 5 minutes, close call records stuck in active/queued for over 2 hours."""
    import asyncio
    from datetime import datetime, timedelta
    from sqlalchemy import update
    from app.models.cdr import CallRecord
    while True:
        await asyncio.sleep(300)
        try:
            cutoff = datetime.now() - timedelta(hours=2)
            async with AsyncSessionLocal() as db:
                await db.execute(
                    update(CallRecord)
                    .where(CallRecord.call_status.in_(["active", "queued", "answered"]))
                    .where(CallRecord.queue_start_time < cutoff)
                    .values(call_status="completed", call_end_time=datetime.now())
                )
                await db.commit()
            # Also clear stale entries from in-memory active_calls dict
            stale_uids = [
                uid for uid, v in list(ami_client._active_calls.items())
                if v.get("start_time") and (datetime.now() - v["start_time"]).total_seconds() > 7200
            ]
            for uid in stale_uids:
                ami_client._active_calls.pop(uid, None)
        except Exception as e:
            logger.warning("Stale call cleanup error: %s", e)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}
