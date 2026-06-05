"""
Alert Service — fires alerts when ticket events occur.
Handles: in-app notifications, email (via SMTP), template rendering.
"""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from loguru import logger

from app.models.alert import Alert, AlertTemplate, AlertTrigger
from app.models.ticket import Ticket
from app.models.user import User
from app.models.notification import Notification, NotificationPriority


def render_template(body: str, variables: dict) -> str:
    """Replace {{key}} placeholders with actual values."""
    for key, val in variables.items():
        body = body.replace(f"{{{{{key}}}}}", str(val or ""))
    return body


def build_variables(ticket: Ticket, agent: Optional[User] = None) -> dict:
    return {
        "ticket_id": ticket.ticket_number,
        "ticket_number": ticket.ticket_number,
        "subject": ticket.subject,
        "status": ticket.status,
        "priority": ticket.priority,
        "customer_name": ticket.customer_name or "",
        "customer_email": ticket.customer_email or "",
        "customer_mobile": ticket.customer_mobile or "",
        "agent_name": agent.full_name if agent else "",
        "created_at": ticket.created_at.strftime("%d %b %Y %H:%M") if ticket.created_at else "",
        "sla_due_at": ticket.sla_due_at.strftime("%d %b %Y %H:%M") if ticket.sla_due_at else "N/A",
    }


async def fire_ticket_alert(
    db: AsyncSession,
    ticket: Ticket,
    trigger: AlertTrigger,
    actor_user_id: Optional[int] = None,
):
    """Called on ticket events — finds matching alert rules and fires them."""
    if not ticket.client_id:
        return

    # Fetch all active alerts for this client matching the trigger
    result = await db.execute(
        select(Alert).where(
            Alert.client_id == ticket.client_id,
            Alert.trigger == trigger,
            Alert.is_active == True,
        )
    )
    alerts = result.scalars().all()
    if not alerts:
        return

    # Fetch actor
    actor = None
    if actor_user_id:
        r = await db.execute(select(User).where(User.id == actor_user_id))
        actor = r.scalar_one_or_none()

    variables = build_variables(ticket, actor)

    for alert in alerts:
        # Check conditions (e.g. only fire for high priority)
        if alert.conditions:
            priority_filter = alert.conditions.get("priority")
            if priority_filter and ticket.priority != priority_filter:
                continue
            status_filter = alert.conditions.get("status")
            if status_filter and ticket.status != status_filter:
                continue

        # Resolve template body
        subject = f"[{ticket.ticket_number}] {ticket.subject}"
        body = f"Ticket {ticket.ticket_number} — {trigger.replace('_', ' ').title()}\n\nCustomer: {ticket.customer_name}\nStatus: {ticket.status}\nPriority: {ticket.priority}"

        if alert.template_id:
            tmpl_r = await db.execute(select(AlertTemplate).where(AlertTemplate.id == alert.template_id))
            tmpl = tmpl_r.scalar_one_or_none()
            if tmpl:
                subject = render_template(tmpl.subject or subject, variables)
                body = render_template(tmpl.body, variables)

        recipients = alert.recipients or {}
        channels = alert.channels or []

        # In-App notification
        if "in_app" in channels:
            notify_user_ids: list[int] = []
            if recipients.get("agent") and ticket.assigned_to:
                notify_user_ids.append(ticket.assigned_to)
            if recipients.get("creator") and ticket.created_by:
                notify_user_ids.append(ticket.created_by)
            for uid in recipients.get("user_ids", []):
                notify_user_ids.append(uid)

            for uid in set(notify_user_ids):
                notif = Notification(
                    user_id=uid,
                    title=subject,
                    message=body[:500],
                    type=trigger,
                    priority=NotificationPriority.HIGH if ticket.priority in ("high", "critical") else NotificationPriority.MEDIUM,
                    action_url=f"/tickets/{ticket.id}",
                    meta={"ticket_id": ticket.id, "ticket_number": ticket.ticket_number},
                )
                db.add(notif)

        # Email — fire async via Celery if available
        if "email" in channels:
            email_list: list[str] = []
            if recipients.get("email"):
                email_list.append(recipients["email"])
            for e in recipients.get("email_list", []):
                email_list.append(e)

            for addr in email_list:
                try:
                    from app.workers.tasks.alerts import send_email_alert
                    send_email_alert.delay(addr, subject, body)
                except Exception as e:
                    logger.warning(f"Celery not available, skipping email to {addr}: {e}")

        # SMS / WhatsApp
        if "sms" in channels or "whatsapp" in channels:
            mobile_list: list[str] = []
            if recipients.get("mobile"):
                mobile_list.append(recipients["mobile"])
            for m in recipients.get("mobile_list", []):
                mobile_list.append(m)

            sms_body = f"{trigger.replace('_', ' ').title()}: {ticket.ticket_number}\n{ticket.subject}\nStatus: {ticket.status}"
            for number in mobile_list:
                try:
                    from app.workers.tasks.alerts import send_sms_alert
                    channel = "whatsapp" if "whatsapp" in channels else "sms"
                    send_sms_alert.delay(number, sms_body, channel)
                except Exception as e:
                    logger.warning(f"Celery not available, skipping SMS to {number}: {e}")

        logger.info(f"Alert '{alert.name}' fired for ticket {ticket.ticket_number} (trigger={trigger})")

    await db.commit()


async def set_ticket_sla(ticket: Ticket, db: AsyncSession):
    """Set SLA due_at based on priority when ticket is created."""
    from datetime import timedelta
    SLA_HOURS = {"low": 48, "medium": 24, "high": 8, "critical": 4}
    hours = SLA_HOURS.get(ticket.priority, 24)
    ticket.sla_due_at = datetime.utcnow() + timedelta(hours=hours)
    await db.flush()
