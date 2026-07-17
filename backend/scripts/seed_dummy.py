"""
Run: venv\Scripts\python.exe scripts\seed_dummy.py
Seeds demo client, agent user, form, campaign upload records, then fires a simulated call.
"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.client import Client, ClientStatus
from app.models.form import Form, FormField, FieldType
from app.models.call import Campaign, CampaignType, CampaignStatus, UploadBatch, UploadRecord
from app.models.ticket import Ticket, TicketStatusEnum, TicketPriority
from sqlalchemy import select
from datetime import datetime, timedelta


async def main():
    async with AsyncSessionLocal() as db:

        # â”€â”€ 1. Demo Client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        r = await db.execute(select(Client).where(Client.company_name == "Demo Corp"))
        client = r.scalar_one_or_none()
        if not client:
            client = Client(
                company_name="Demo Corp",
                slug="demo-corp",
                email="contact@democorp.com",
                mobile="9876543210",
                city="Mumbai",
                status=ClientStatus.ACTIVE,
                plan="professional",
                max_agents=10,
                max_users=20,
            )
            db.add(client)
            await db.flush()
            print(f"âœ“ Client created: Demo Corp (id={client.id})")
        else:
            print(f"âœ“ Client exists: Demo Corp (id={client.id})")

        # â”€â”€ 2. Agent User â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        r = await db.execute(select(User).where(User.email == "agent1@democorp.com"))
        agent = r.scalar_one_or_none()
        if not agent:
            agent = User(
                email="agent1@democorp.com",
                full_name="Priya Sharma",
                mobile="9000000001",
                hashed_password=get_password_hash("Agent@123"),
                role=UserRole.AGENT,
                client_id=client.id,
                is_active=True,
                is_email_verified=True,
                extension="8001",   # ViciBox extension
            )
            db.add(agent)
            await db.flush()
            print(f"âœ“ Agent created: agent1@democorp.com / Agent@123  (ext=8001, id={agent.id})")
        else:
            if not agent.extension:
                agent.extension = "8001"
            print(f"âœ“ Agent exists: {agent.email} (id={agent.id})")

        # â”€â”€ 3. Supervisor User â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        r = await db.execute(select(User).where(User.email == "supervisor@democorp.com"))
        sup = r.scalar_one_or_none()
        if not sup:
            sup = User(
                email="supervisor@democorp.com",
                full_name="Amit Verma",
                mobile="9000000002",
                hashed_password=get_password_hash("Sup@123"),
                role=UserRole.TEAM_USER,
                client_id=client.id,
                is_active=True,
                is_email_verified=True,
            )
            db.add(sup)
            print(f"âœ“ Supervisor created: supervisor@democorp.com / Sup@123")

        # â”€â”€ 4. Demo Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        r = await db.execute(select(Form).where(Form.client_id == client.id, Form.category == "ticket"))
        form = r.scalar_one_or_none()
        if not form:
            admin_r = await db.execute(select(User).where(User.role == UserRole.ADMIN))
            admin = admin_r.scalar_one_or_none()

            form = Form(
                client_id=client.id,
                name="Inbound Call Form",
                slug="inbound-call-form",
                description="Auto-loaded when a call arrives from ViciBox",
                category="ticket",
                is_active=True,
                created_by=admin.id if admin else 1,
            )
            db.add(form)
            await db.flush()

            fields = [
                FormField(form_id=form.id, label="Customer Name", field_name="customer_name", field_type=FieldType.TEXT, placeholder="Full name", is_required=True, order=1),
                FormField(form_id=form.id, label="Mobile Number", field_name="customer_mobile", field_type=FieldType.MOBILE, placeholder="+91 9999999999", is_required=True, order=2),
                FormField(form_id=form.id, label="Email", field_name="customer_email", field_type=FieldType.EMAIL, placeholder="customer@email.com", is_required=False, order=3),
                FormField(form_id=form.id, label="City", field_name="city", field_type=FieldType.TEXT, placeholder="Mumbai", is_required=False, order=4),
                FormField(form_id=form.id, label="Query Type", field_name="query_type", field_type=FieldType.DROPDOWN, is_required=True, order=5,
                          options=[
                              {"label": "Billing Issue", "value": "billing"},
                              {"label": "Technical Support", "value": "tech"},
                              {"label": "Product Inquiry", "value": "inquiry"},
                              {"label": "Complaint", "value": "complaint"},
                              {"label": "Other", "value": "other"},
                          ]),
                FormField(form_id=form.id, label="Priority", field_name="priority", field_type=FieldType.RADIO, is_required=True, order=6,
                          options=[
                              {"label": "Low", "value": "low"},
                              {"label": "Medium", "value": "medium"},
                              {"label": "High", "value": "high"},
                          ]),
                FormField(form_id=form.id, label="Notes", field_name="subject", field_type=FieldType.TEXTAREA, placeholder="Describe the issue...", is_required=True, order=7),
            ]
            for f in fields:
                db.add(f)
            print(f"âœ“ Form created: 'Inbound Call Form' (id={form.id}) with {len(fields)} fields")
        else:
            print(f"âœ“ Form exists: {form.name} (id={form.id})")

        # â”€â”€ 5. Campaign + Upload Records (customer list) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        r = await db.execute(select(Campaign).where(Campaign.client_id == client.id))
        campaign = r.scalar_one_or_none()
        if not campaign:
            campaign = Campaign(
                client_id=client.id,
                created_by=agent.id,
                name="June 2026 Inbound",
                campaign_type=CampaignType.MANUAL,
                status=CampaignStatus.ACTIVE,
            )
            db.add(campaign)
            await db.flush()

            batch = UploadBatch(
                client_id=client.id,
                campaign_id=campaign.id,
                file_name="customers.csv",
                file_url="",
                status="completed",
                total_records=5,
                uploaded_by=agent.id,
                completed_at=datetime.utcnow(),
            )
            db.add(batch)
            await db.flush()

            customers = [
                ("Ravi Mehta",     "9111111111", "ravi@gmail.com",    "Delhi"),
                ("Sunita Patel",   "9222222222", "sunita@yahoo.com",  "Ahmedabad"),
                ("Arun Singh",     "9333333333", "arun@outlook.com",  "Pune"),
                ("Meena Joshi",    "9444444444", "meena@gmail.com",   "Bengaluru"),
                ("Vikram Reddy",   "9555555555", "vikram@gmail.com",  "Hyderabad"),
            ]
            for name, mobile, email, city in customers:
                db.add(UploadRecord(
                    batch_id=batch.id,
                    client_id=client.id,
                    campaign_id=campaign.id,
                    name=name,
                    mobile=mobile,
                    email=email,
                    city=city,
                ))
            print(f"âœ“ Campaign + {len(customers)} customer records created")
        else:
            print(f"âœ“ Campaign exists (id={campaign.id})")

        # â”€â”€ 6. Sample tickets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        r = await db.execute(select(Ticket).where(Ticket.client_id == client.id))
        if not r.scalars().first():
            for i, (cname, cmobile, subj, prio) in enumerate([
                ("Ravi Mehta",   "9111111111", "Billing not updated after payment", TicketPriority.HIGH),
                ("Sunita Patel", "9222222222", "App crashes on login",              TicketPriority.CRITICAL),
                ("Arun Singh",   "9333333333", "Need invoice for March",            TicketPriority.LOW),
            ]):
                from app.utils.ticket_number import generate_ticket_number
                tnum = await generate_ticket_number(db, client.id)
                t = Ticket(
                    ticket_number=tnum,
                    client_id=client.id,
                    created_by=agent.id,
                    assigned_to=agent.id,
                    customer_name=cname,
                    customer_mobile=cmobile,
                    subject=subj,
                    priority=prio,
                    status=TicketStatusEnum.OPEN,
                    sla_due_at=datetime.utcnow() + timedelta(hours=8 if prio == TicketPriority.HIGH else 4),
                )
                db.add(t)
            print("âœ“ 3 sample tickets created")

        await db.commit()
        print("\nâœ… All dummy data seeded!")
        print("â”€" * 50)
        print("Admin login  : admin@cti-crm.com  / Admin@123")
        print("Agent login  : agent1@democorp.com / Agent@123  (ext: 8001)")
        print("Supervisor   : supervisor@democorp.com / Sup@123")
        print("Frontend     : http://localhost:3002")
        print("Backend docs : http://localhost:8000/api/docs")
        print("â”€" * 50)

asyncio.run(main())

