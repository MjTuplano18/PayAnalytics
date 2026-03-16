import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routers import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import AsyncSessionFactory
from app.repositories.audit_log_repository import AuditLogRepository

logger = logging.getLogger(__name__)

AUDIT_LOG_CLEANUP_INTERVAL = 20 * 60  # 20 minutes in seconds
AUDIT_LOG_MAX_AGE_MINUTES = 20


async def _audit_log_cleanup_loop() -> None:
    """Background task that deletes audit log entries older than 20 minutes."""
    while True:
        await asyncio.sleep(AUDIT_LOG_CLEANUP_INTERVAL)
        try:
            async with AsyncSessionFactory() as session:
                repo = AuditLogRepository(session)
                deleted = await repo.delete_older_than(AUDIT_LOG_MAX_AGE_MINUTES)
                await session.commit()
                if deleted:
                    logger.info("Audit log cleanup: deleted %d old entries", deleted)
        except Exception:
            logger.exception("Audit log cleanup failed")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    cleanup_task = asyncio.create_task(_audit_log_cleanup_loop())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

    app.include_router(api_router)

    @app.get("/", tags=["Health"])
    async def root() -> dict:
        return {"name": settings.APP_NAME, "version": settings.APP_VERSION, "status": "ok"}

    @app.get("/health", tags=["Health"])
    async def health_check() -> dict:
        return {"status": "ok", "version": settings.APP_VERSION}

    return app


app = create_app()
