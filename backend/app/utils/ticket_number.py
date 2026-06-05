from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.ticket import Ticket


async def generate_ticket_number(db: AsyncSession, client_id: int | None) -> str:
    result = await db.execute(select(func.count()).select_from(Ticket))
    count = result.scalar() or 0
    cid = client_id or 0
    return f"TKT-{cid:04d}-{count + 1:06d}"
