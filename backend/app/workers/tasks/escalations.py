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


@celery_app.task(name="app.workers.tasks.escalations.check_escalations", queue="escalations")
def check_escalations():
    """Every 5 min: find tickets past escalation time and fire escalation alerts."""
    run_async(_check_escalations_async())


@celery_app.task(name="app.workers.tasks.escalations.check_sla_breaches", queue="escalations")
def check_sla_breaches():
    """Every 10 min: find tickets past SLA due date and send breach alerts."""
    run_async(_check_sla_breaches_async())


async def _check_escalations_async():
    from datetime import datetime, timedelta
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.ticket import Ticket, TicketStatusEnum, TicketLog
    from app.models.alert import EscalationRule, EscalationLog
    from app.models.notification import Notification, NotificationPriority
    from app.models.user import User

    async with AsyncSessionLocal() as db:
        # Get all active escalation rules
        result = await db.execute(
            select(EscalationRule).where(EscalationRule.is_active == True)
        )
        rules = result.scalars().all()

        if not rules:
            return

        # Get all open/pending tickets (not resolved/closed)
        open_statuses = [TicketStatusEnum.OPEN, TicketStatusEnum.PENDING, TicketStatusEnum.IN_PROGRESS, TicketStatusEnum.REOPENED]
        tickets_result = await db.execute(
            select(Ticket).where(Ticket.status.in_(open_statuses))
        )
        tickets = tickets_result.scalars().all()

        now = datetime.utcnow()
        escalated = 0

        for ticket in tickets:
            for rule in rules:
                # Match by client
                if rule.client_id and rule.client_id != ticket.client_id:
                    continue
                # Match by priority
                if rule.priority and rule.priority != ticket.priority:
                    continue
                # Match by department
                if rule.department_id and rule.department_id != ticket.department_id:
                    continue

                ticket_age_hours = (now - ticket.created_at).total_seconds() / 3600

                for i, level in enumerate(rule.levels):
                    after_hours = level.get("after_hours", 2)
                    if ticket_age_hours < after_hours:
                        continue

                    # Check if already escalated at this level
                    already = await db.execute(
                        select(EscalationLog).where(
                            EscalationLog.ticket_id == ticket.id,
                            EscalationLog.rule_id == rule.id,
                            EscalationLog.level == i + 1,
                        )
                    )
                    if already.scalar_one_or_none():
                        continue

                    # Create escalation log
                    esc_log = EscalationLog(
                        ticket_id=ticket.id,
                        rule_id=rule.id,
                        level=i + 1,
                        reason=f"Ticket open for {ticket_age_hours:.1f}h, rule threshold {after_hours}h",
                    )
                    db.add(esc_log)

                    # Update ticket escalation level
                    ticket.escalation_level = i + 1

                    # Send in-app notification to notify_user_id
                    notify_user_id = level.get("notify_user_id")
                    if notify_user_id:
                        notif = Notification(
                            user_id=notify_user_id,
                            title=f"Escalation L{i+1}: {ticket.ticket_number}",
                            message=f"Ticket '{ticket.subject}' has been open for {ticket_age_hours:.0f} hours and requires attention.",
                            type="escalation",
                            priority=NotificationPriority.HIGH,
                            action_url=f"/tickets/{ticket.id}",
                            meta={"ticket_id": ticket.id, "level": i + 1},
                        )
                        db.add(notif)

                    # Send email if configured
                    notify_email = level.get("notify_email")
                    if notify_email:
                        try:
                            from app.workers.tasks.alerts import send_email_alert
                            send_email_alert.delay(
                                notify_email,
                                f"[Escalation L{i+1}] {ticket.ticket_number} — {ticket.subject}",
                                f"Ticket {ticket.ticket_number} has been open for {ticket_age_hours:.0f} hours.\n\nCustomer: {ticket.customer_name}\nPriority: {ticket.priority}\nStatus: {ticket.status}\n\nPlease review immediately."
                            )
                        except Exception:
                            pass

                    escalated += 1
                    logger.info(f"Escalated ticket {ticket.ticket_number} to level {i+1}")

        if escalated:
            await db.commit()
            logger.info(f"Escalation check: {escalated} tickets escalated")
        else:
            logger.info("Escalation check: no tickets need escalation")


async def _check_sla_breaches_async():
    from datetime import datetime
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.ticket import Ticket, TicketStatusEnum
    from app.models.alert import Alert, AlertTrigger
    from app.services.alert_service import fire_ticket_alert

    async with AsyncSessionLocal() as db:
        now = datetime.utcnow()
        open_statuses = [TicketStatusEnum.OPEN, TicketStatusEnum.PENDING, TicketStatusEnum.IN_PROGRESS]

        result = await db.execute(
            select(Ticket).where(
                Ticket.status.in_(open_statuses),
                Ticket.sla_due_at != None,
                Ticket.sla_due_at <= now,
            )
        )
        breached = result.scalars().all()

        for ticket in breached:
            await fire_ticket_alert(db, ticket, AlertTrigger.SLA_BREACH, None)

        if breached:
            logger.info(f"SLA breach check: {len(breached)} tickets breached")
        else:
            logger.info("SLA breach check: no breaches")
