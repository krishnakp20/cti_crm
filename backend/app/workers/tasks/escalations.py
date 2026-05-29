from app.workers.celery_app import celery_app
from loguru import logger


@celery_app.task(name="app.workers.tasks.escalations.check_escalations", queue="escalations")
def check_escalations():
    logger.info("Running escalation check...")


@celery_app.task(name="app.workers.tasks.escalations.check_sla_breaches", queue="escalations")
def check_sla_breaches():
    logger.info("Running SLA breach check...")
