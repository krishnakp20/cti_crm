from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "cti_crm",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.tasks.alerts",
        "app.workers.tasks.escalations",
        "app.workers.tasks.dialer",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.workers.tasks.alerts.*": {"queue": "alerts"},
        "app.workers.tasks.escalations.*": {"queue": "escalations"},
        "app.workers.tasks.dialer.*": {"queue": "calls"},
    },
    beat_schedule={
        "check-escalations-every-5-min": {
            "task": "app.workers.tasks.escalations.check_escalations",
            "schedule": 300.0,
        },
        "check-sla-breaches-every-10-min": {
            "task": "app.workers.tasks.escalations.check_sla_breaches",
            "schedule": 600.0,
        },
        "check-callbacks-every-minute": {
            "task": "app.workers.tasks.alerts.check_callback_reminders",
            "schedule": 60.0,
        },
    },
)
