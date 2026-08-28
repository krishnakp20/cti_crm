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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
