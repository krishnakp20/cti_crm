from app.workers.celery_app import celery_app
from loguru import logger
import asyncio


def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.workers.tasks.alerts.send_email_alert", queue="alerts", bind=True, max_retries=3)
def send_email_alert(self, to: str, subject: str, body: str):
    """Send email via SMTP. Retries up to 3 times on failure."""
    run_async(_send_email_async(to, subject, body, self))


@celery_app.task(name="app.workers.tasks.alerts.send_sms_alert", queue="alerts", bind=True, max_retries=3)
def send_sms_alert(self, to: str, message: str, channel: str = "sms"):
    """Send SMS or WhatsApp. Gateway chosen by SMS_GATEWAY env var."""
    run_async(_send_sms_async(to, message, channel, self))


@celery_app.task(name="app.workers.tasks.alerts.check_callback_reminders", queue="alerts")
def check_callback_reminders():
    run_async(_check_callbacks_async())


async def _send_sms_async(to: str, message: str, channel: str = "sms", task=None):
    import os, httpx
    gateway = os.getenv("SMS_GATEWAY", "").lower()

    logger.info(f"[{channel.upper()}] To: {to} | Gateway: {gateway or 'none'} | Msg: {message[:60]}")

    if not gateway:
        logger.warning(f"[{channel.upper()}] SMS_GATEWAY not set in .env — message not sent (preview above)")
        return

    try:
        if gateway == "msg91":
            # MSG91 — India
            auth_key   = os.getenv("MSG91_AUTH_KEY", "")
            sender_id  = os.getenv("MSG91_SENDER_ID", "CTISMS")
            mobile = to.replace("+", "").replace(" ", "")
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    "https://api.msg91.com/api/v5/otp",
                    headers={"authkey": auth_key, "Content-Type": "application/json"},
                    json={"template_id": "", "mobile": mobile, "message": message, "sender": sender_id},
                )
            logger.info(f"[MSG91] Response: {r.status_code} {r.text[:100]}")

        elif gateway == "fast2sms":
            # Fast2SMS — India
            api_key = os.getenv("FAST2SMS_API_KEY", "")
            mobile = to.replace("+91", "").replace(" ", "")
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    "https://www.fast2sms.com/dev/bulkV2",
                    headers={"authorization": api_key},
                    json={"route": "q", "message": message, "language": "english", "flash": 0, "numbers": mobile},
                )
            logger.info(f"[Fast2SMS] Response: {r.status_code} {r.text[:100]}")

        elif gateway == "twilio":
            # Twilio — Global SMS + WhatsApp
            sid   = os.getenv("TWILIO_SID", "")
            token = os.getenv("TWILIO_TOKEN", "")
            from_num = os.getenv("TWILIO_FROM", "")
            to_num = to if channel == "sms" else f"whatsapp:{to}"
            from_fmt = from_num if channel == "sms" else f"whatsapp:{from_num}"
            async with httpx.AsyncClient(auth=(sid, token)) as client:
                r = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                    data={"From": from_fmt, "To": to_num, "Body": message},
                )
            logger.info(f"[Twilio] Response: {r.status_code} {r.text[:100]}")

        else:
            logger.warning(f"Unknown SMS_GATEWAY: {gateway}")

    except Exception as e:
        logger.error(f"[{channel.upper()}] Failed: {e}")
        if task:
            raise task.retry(exc=e, countdown=60)


async def _send_email_async(to: str, subject: str, body: str, task=None):
    from app.core.config import settings
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning(f"[EMAIL] SMTP not configured — skipping email to {to}")
        logger.info(f"[EMAIL PREVIEW] To: {to} | Subject: {subject}\n{body}")
        return

    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to

        # Plain text version
        msg.attach(MIMEText(body, "plain"))

        # HTML version
        html_body = body.replace("\n", "<br>")
        html = f"""
        <html><body style="font-family:Arial,sans-serif;font-size:14px;color:#333">
        <div style="max-width:600px;margin:0 auto;padding:20px">
        <div style="background:#6366f1;color:white;padding:12px 20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px">{subject}</h2>
        </div>
        <div style="background:#f9f9f9;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e0e0e0">
            {html_body}
        </div>
        <p style="font-size:11px;color:#999;margin-top:10px">CTI CRM Platform</p>
        </div></body></html>
        """
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info(f"[EMAIL] Sent to {to}: {subject}")

    except Exception as e:
        logger.error(f"[EMAIL] Failed to send to {to}: {e}")
        if task:
            raise task.retry(exc=e, countdown=60)


async def _check_callbacks_async():
    from datetime import datetime, timedelta
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.call import CallbackSchedule
    from app.models.notification import Notification, NotificationPriority

    async with AsyncSessionLocal() as db:
        now = datetime.utcnow()
        remind_window = now + timedelta(minutes=15)

        result = await db.execute(
            select(CallbackSchedule).where(
                CallbackSchedule.status == "pending",
                CallbackSchedule.is_notified == False,
                CallbackSchedule.scheduled_at <= remind_window,
                CallbackSchedule.scheduled_at >= now,
            )
        )
        callbacks = result.scalars().all()

        for cb in callbacks:
            notif = Notification(
                user_id=cb.agent_id,
                title=f"Callback Reminder: {cb.customer_name or cb.phone_number}",
                message=f"You have a callback scheduled at {cb.scheduled_at.strftime('%H:%M')} with {cb.customer_name or cb.phone_number}.",
                type="callback_reminder",
                priority=NotificationPriority.HIGH,
                action_url=f"/tickets/{cb.ticket_id}" if cb.ticket_id else "/agent",
                meta={"callback_id": cb.id, "phone": cb.phone_number},
            )
            db.add(notif)
            cb.is_notified = True

        if callbacks:
            await db.commit()
            logger.info(f"Callback reminders: {len(callbacks)} sent")
