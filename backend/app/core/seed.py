from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User, UserRole, Permission
from app.models.client import Client, ClientStatus
from app.core.security import get_password_hash
from loguru import logger

PERMISSIONS = [
    ("Create Ticket", "create_ticket", "tickets"),
    ("Edit Ticket", "edit_ticket", "tickets"),
    ("Delete Ticket", "delete_ticket", "tickets"),
    ("Close Ticket", "close_ticket", "tickets"),
    ("Reopen Ticket", "reopen_ticket", "tickets"),
    ("Assign Ticket", "assign_ticket", "tickets"),
    ("Export Ticket", "export_ticket", "tickets"),
    ("View Reports", "view_reports", "reports"),
    ("Export Reports", "export_reports", "reports"),
    ("Upload Data", "upload_data", "calling"),
    ("Manual Calling", "manual_calling", "calling"),
    ("Predictive Calling", "predictive_calling", "calling"),
    ("Create User", "create_user", "users"),
    ("Edit User", "edit_user", "users"),
    ("Deactivate User", "deactivate_user", "users"),
    ("Create Form", "create_form", "forms"),
    ("Edit Form", "edit_form", "forms"),
    ("Delete Form", "delete_form", "forms"),
    ("View Clients", "view_clients", "clients"),
    ("Edit Clients", "edit_clients", "clients"),
    ("Activate Client", "activate_client", "clients"),
    ("Create Campaign", "create_campaign", "campaigns"),
    ("Edit Campaign", "edit_campaign", "campaigns"),
    ("Create Alert", "create_alert", "alerts"),
    ("Edit Alert", "edit_alert", "alerts"),
    ("View Audit", "view_audit", "audit"),
]


async def seed_database(db: AsyncSession):
    for name, slug, module in PERMISSIONS:
        result = await db.execute(select(Permission).where(Permission.slug == slug))
        if not result.scalar_one_or_none():
            db.add(Permission(name=name, slug=slug, module=module))

    result = await db.execute(select(User).where(User.email == "admin@cti-crm.com"))
    if not result.scalar_one_or_none():
        admin = User(
            email="admin@cti-crm.com",
            full_name="System Admin",
            hashed_password=get_password_hash("Admin@123"),
            role=UserRole.ADMIN,
            is_active=True,
            is_email_verified=True,
        )
        db.add(admin)
        logger.info("Created admin user: admin@cti-crm.com / Admin@123")

    await db.commit()
    logger.info("Database seeded successfully")
