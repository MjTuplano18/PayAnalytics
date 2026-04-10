"""
In-process TTL cache for expensive query results.

Uses a simple dict + expiry timestamps.  Designed for single-process
deployments (Render free tier) where Redis is not available.

Typical budget: ~50 MB of the 512 MB RAM limit.
"""

import time
from typing import Any

_cache: dict[str, tuple[float, Any]] = {}

# Default TTL in seconds (5 minutes)
DEFAULT_TTL = 300


def cache_get(key: str) -> Any | None:
    """Return cached value if it exists and hasn't expired, else None."""
    entry = _cache.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.monotonic() > expires_at:
        _cache.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    """Store a value in cache with a TTL (seconds)."""
    _cache[key] = (time.monotonic() + ttl, value)


def cache_invalidate(prefix: str) -> int:
    """Remove all keys starting with *prefix*. Returns count removed."""
    to_remove = [k for k in _cache if k.startswith(prefix)]
    for k in to_remove:
        _cache.pop(k, None)
    return len(to_remove)


def cache_clear() -> None:
    """Drop entire cache (e.g. on shutdown or for tests)."""
    _cache.clear()
