from app.workers.celery_app import celery_app
from loguru import logger


@celery_app.task(name="app.workers.tasks.alerts.send_email_alert", queue="alerts")
def send_email_alert(to: str, subject: str, body: str):
    logger.info(f"Sending email to {to}: {subject}")


@celery_app.task(name="app.workers.tasks.alerts.send_sms_alert", queue="alerts")
def send_sms_alert(to: str, message: str):
    logger.info(f"Sending SMS to {to}: {message}")


@celery_app.task(name="app.workers.tasks.alerts.check_callback_reminders", queue="alerts")
def check_callback_reminders():
    logger.info("Checking callback reminders...")
