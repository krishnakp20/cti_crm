from app.workers.celery_app import celery_app
from loguru import logger
import httpx


@celery_app.task(name="app.workers.tasks.dialer.push_records_to_dialer", queue="calls")
def push_records_to_dialer(campaign_id: int, batch_id: int, dialer_url: str, api_key: str):
    logger.info(f"Pushing batch {batch_id} to dialer for campaign {campaign_id}")
