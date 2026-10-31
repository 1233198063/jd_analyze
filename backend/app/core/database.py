from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


# Columns added to tables that already existed. create_all only creates missing tables, never
# missing columns, so an existing database (a friend's copy, or yours) gets them here instead.
ADDED_COLUMNS = [
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posting_status VARCHAR(20)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posting_checked_at TIMESTAMPTZ",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posting_check_note TEXT",
]


async def init_db() -> None:
    """Create missing tables and columns. Run by the API on startup and by scheduled scripts,
    which can run before the API has ever started on new code."""
    import app.models  # noqa: F401  (registers every model on Base.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for statement in ADDED_COLUMNS:
            await conn.execute(text(statement))


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
