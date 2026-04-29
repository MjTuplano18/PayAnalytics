from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # Validate connections before use (important for serverless)
)

AsyncSessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncSession:  # type: ignore[misc]
    """FastAPI dependency that provides a database session per request."""
    async with AsyncSessionFactory() as session:
        try:
            yield session
        except Exception:
            try:
                await session.rollback()
            except Exception:
                pass  # Connection may already be closed
            raise
        else:
            try:
                await session.commit()
            except Exception:
                try:
                    await session.rollback()
                except Exception:
                    pass
                raise
