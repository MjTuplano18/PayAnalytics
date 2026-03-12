"""
Simple in-memory sliding-window rate limiter.

For single-process deployments this is sufficient.
For multi-process / multi-server deployments replace the in-memory store
with a shared Redis-backed counter (e.g. via aioredis).
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

# Stores timestamps (seconds) of recent requests keyed by client IP
_attempt_log: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Return the real client IP, respecting X-Forwarded-For if present."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_login_rate_limit(request: Request) -> None:
    """
    Raise HTTP 429 if the client IP has exceeded the configured login attempt
    threshold within the rolling time window.

    Call this at the start of the login endpoint.
    """
    ip = _client_ip(request)
    now = time.monotonic()
    window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    max_attempts = settings.LOGIN_RATE_LIMIT_MAX_ATTEMPTS

    log = _attempt_log[ip]

    # Evict timestamps older than the window
    while log and log[0] < now - window:
        log.popleft()

    if len(log) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Too many login attempts. "
                f"Please wait {window} seconds before trying again."
            ),
            headers={"Retry-After": str(window)},
        )

    log.append(now)
