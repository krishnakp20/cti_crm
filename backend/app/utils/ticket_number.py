from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.ticket import Ticket


async def generate_ticket_number(db: AsyncSession, client_id: int) -> str:
    result = await db.execute(select(func.count()).where(Ticket.client_id == client_id))
    count = result.scalar() or 0
    return f"TKT-{client_id:04d}-{count + 1:06d}"
