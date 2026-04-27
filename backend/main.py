import asyncio
import logging
import re
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routers import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import AsyncSessionFactory
from app.repositories.audit_log_repository import AuditLogRepository

logger = logging.getLogger(__name__)

AUDIT_LOG_CLEANUP_INTERVAL = 24 * 60 * 60  # 24 hours in seconds
AUDIT_LOG_MAX_AGE_MINUTES = 24 * 60  # 24 hours


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

    logger.info("CORS allowed_origins: %s", settings.ALLOWED_ORIGINS)
    logger.info("CORS allowed_origin_regex: %s", settings.ALLOWED_ORIGINS_REGEX or "(none)")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_origin_regex=settings.ALLOWED_ORIGINS_REGEX or None,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

    # Fallback CORS: ensure error responses (404/500) always carry CORS headers
    _origin_re = re.compile(settings.ALLOWED_ORIGINS_REGEX) if settings.ALLOWED_ORIGINS_REGEX else None

    @app.middleware("http")
    async def cors_fallback(request: Request, call_next: object) -> Response:
        response: Response = await call_next(request)  # type: ignore[operator]
        origin = request.headers.get("origin", "")
        if origin and "access-control-allow-origin" not in response.headers:
            allowed = origin in settings.ALLOWED_ORIGINS or (
                _origin_re is not None and _origin_re.fullmatch(origin) is not None
            )
            if allowed:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Vary"] = "Origin"
        return response

    app.include_router(api_router)

    @app.get("/", tags=["Health"])
    async def root() -> dict:
        return {"name": settings.APP_NAME, "version": settings.APP_VERSION, "status": "ok"}

    @app.get("/health", tags=["Health"])
    async def health_check() -> dict:
        return {"status": "ok", "version": settings.APP_VERSION}

    return app


app = create_app()
