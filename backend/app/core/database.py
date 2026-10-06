from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=False,
    pool_recycle=3600,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    # Import all models so metadata is populated before create_all
    import app.models.user  # noqa
    import app.models.client  # noqa
    import app.models.call  # noqa
    import app.models.ticket  # noqa
    import app.models.cdr  # noqa
    import app.models.ivr  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _ensure_columns()


def _add_missing_columns(sync_conn):
    from sqlalchemy import inspect, text
    # create_all never alters existing tables; add columns introduced after first deploy
    wanted = [
        ("ivr_routes", "voicemail_mailbox", "VARCHAR(100) NULL"),
        ("ivr_configs", "hours_enabled", "TINYINT(1) NOT NULL DEFAULT 0"),
        ("ivr_configs", "timezone", "VARCHAR(50) NULL"),
        ("ivr_configs", "schedule", "JSON NULL"),
        ("ivr_configs", "closed_audio", "VARCHAR(255) NULL"),
    ]
    insp = inspect(sync_conn)
    for table, column, ddl in wanted:
        existing = {c["name"] for c in insp.get_columns(table)}
        if column not in existing:
            sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


async def _ensure_columns():
    import logging
    try:
        async with engine.begin() as conn:
            await conn.run_sync(_add_missing_columns)
    except Exception as e:
        logging.getLogger(__name__).warning("Column check failed: %s", e)
