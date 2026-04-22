# Rate Limiting and Caching Services

This document describes the in-memory rate limiting and caching services implemented for the AI Chat Assistant feature.

## Overview

These services provide request rate limiting, token usage tracking, and response caching for AI chat queries. They are designed for **single-process deployments** (e.g., Render free tier) and use in-memory storage instead of Redis.

## Architecture

### RateLimiter Service

**Location:** `backend/app/services/rate_limiter.py`

**Purpose:** Enforce per-user rate limits to control costs and prevent abuse.

**Features:**
- **Request Rate Limiting:** 20 requests per minute per user
- **Token Rate Limiting:** 50,000 tokens per day per user
- **Sliding Window Algorithm:** Uses `collections.deque` for efficient timestamp tracking
- **Automatic Cleanup:** Removes old token usage data (>2 days) to prevent memory bloat
- **HTTP Exception Support:** Raises FastAPI HTTPException with 429 status and Retry-After header

**Usage Example:**
```python
from app.services.rate_limiter import get_rate_limiter

rate_limiter = get_rate_limiter()

# Check and enforce rate limits
rate_limiter.raise_if_rate_limited(user_id, estimated_tokens=1000)

# Record usage after successful request
rate_limiter.increment_request_count(user_id)
rate_limiter.record_token_usage(user_id, tokens_used=150)

# Query current usage
usage = rate_limiter.get_user_token_usage(user_id)
```

**Configuration:**
- `REQUEST_LIMIT_PER_MINUTE = 20`
- `REQUEST_WINDOW_SECONDS = 60`
- `TOKEN_LIMIT_PER_DAY = 50000`
- `TOKEN_WINDOW_SECONDS = 86400` (24 hours)

### CacheManager Service

**Location:** `backend/app/services/cache_manager.py`

**Purpose:** Cache AI responses to reduce API costs and improve response times.

**Features:**
- **Query Normalization:** Lowercase conversion, whitespace removal for consistent cache keys
- **Hash-Based Keys:** SHA-256 hash of normalized query + user_id
- **24-Hour TTL:** Automatic expiration via underlying cache infrastructure
- **Per-User LRU Eviction:** Maximum 1000 cached entries per user
- **Chart Metadata Support:** Caches both text responses and visualization data

**Usage Example:**
```python
from app.services.cache_manager import get_cache_manager

cache_manager = get_cache_manager()

# Check cache before processing
cached = cache_manager.get_cached_response(query, user_id)
if cached:
    return cached.response, cached.chart_metadata

# Process query (AI call, SQL execution, etc.)
response = process_query(query)
chart_metadata = generate_chart(results)

# Cache the response
cache_manager.cache_response(query, user_id, response, chart_metadata)
```

**Configuration:**
- `CACHE_TTL_SECONDS = 86400` (24 hours)
- `MAX_ENTRIES_PER_USER = 1000`
- `CACHE_KEY_PREFIX = "ai_chat"`

## Integration with Existing Infrastructure

Both services extend the existing in-memory infrastructure:

### Extends: `backend/app/core/rate_limit.py`
- Uses same sliding window pattern as login rate limiting
- Uses `time.monotonic()` for timestamp tracking
- Uses `collections.deque` for efficient FIFO operations

### Extends: `backend/app/core/cache.py`
- Uses existing `cache_get()` and `cache_set()` functions
- Leverages TTL-based expiration
- Adds LRU tracking layer on top for per-user limits

## Memory Considerations

For single-process deployment on Render free tier (512 MB RAM):

**RateLimiter Memory Usage:**
- Request log: ~8 bytes per timestamp × 20 requests × N users
- Token usage: ~24 bytes per (user_id, date) pair × N users
- Estimated: <1 MB for 1000 active users

**CacheManager Memory Usage:**
- Cache keys tracking: ~100 bytes per entry × 1000 entries × N users
- Cached responses: Variable (depends on response size)
- Estimated: ~10-50 MB for typical usage

**Total Budget:** ~50 MB allocated for rate limiting and caching (within 512 MB limit)

## Testing

### Unit Tests
- `backend/tests/test_rate_limiter.py` - 12 tests covering all rate limiting scenarios
- `backend/tests/test_cache_manager.py` - 18 tests covering caching and LRU eviction

### Integration Tests
- `backend/tests/test_rate_limit_cache_integration.py` - 5 tests demonstrating real-world usage

**Run Tests:**
```bash
cd backend
python -m pytest tests/test_rate_limiter.py -v
python -m pytest tests/test_cache_manager.py -v
python -m pytest tests/test_rate_limit_cache_integration.py -v
```

## Requirements Mapping

### RateLimiter Requirements
- **Requirement 5.1:** ✅ Rate limiting enforced (20 requests/minute)
- **Requirement 5.2:** ✅ 429 status with Retry-After header
- **Requirement 5.3:** ✅ Token usage tracking per user per day
- **Requirement 5.4:** ✅ 50,000 tokens/day limit enforced

### CacheManager Requirements
- **Requirement 8.1:** ✅ Cache check for identical queries
- **Requirement 8.2:** ✅ Return cached response without AI call
- **Requirement 8.3:** ✅ 24-hour TTL
- **Requirement 8.4:** ✅ Hash-based cache keys
- **Requirement 8.5:** ✅ Query normalization (lowercase, whitespace)
- **Requirement 8.6:** ✅ 1000 entries per user limit
- **Requirement 8.7:** ✅ LRU eviction when limit exceeded

## Future Enhancements

If migrating to multi-process deployment:

1. **Replace with Redis:**
   - Swap in-memory storage with Redis
   - Use Redis sorted sets for sliding window rate limiting
   - Use Redis hash for cache storage with TTL
   - Minimal code changes required (same interface)

2. **Add Monitoring:**
   - Track cache hit rates
   - Monitor rate limit violations
   - Alert on high token usage

3. **Configuration:**
   - Make limits configurable via environment variables
   - Support different limits per user tier (free/premium)

## API Reference

### RateLimiter

#### `check_request_limit(user_id: str) -> RateLimitResult`
Check if user is within request rate limit.

#### `check_token_limit(user_id: str, estimated_tokens: int) -> RateLimitResult`
Check if user is within daily token limit.

#### `increment_request_count(user_id: str) -> None`
Increment request counter for user.

#### `record_token_usage(user_id: str, tokens_used: int) -> None`
Record token usage for user.

#### `raise_if_rate_limited(user_id: str, estimated_tokens: int) -> None`
Check rate limits and raise HTTPException if exceeded.

### CacheManager

#### `normalize_query(query: str) -> str`
Normalize query for cache key generation.

#### `get_cached_response(query: str, user_id: str) -> CachedResponse | None`
Retrieve cached response if available.

#### `cache_response(query: str, user_id: str, response: str, chart_metadata: dict | None) -> None`
Cache an AI response with optional chart metadata.

#### `invalidate_user_cache(user_id: str) -> int`
Invalidate all cached responses for a user.

#### `get_user_cache_size(user_id: str) -> int`
Get number of cached entries for a user.

## Notes

- Both services use singleton pattern via `get_*()` functions for single-process deployment
- Thread-safe for single-threaded async applications (FastAPI default)
- Not suitable for multi-process deployments without Redis backend
- Memory usage is bounded and predictable
- Automatic cleanup prevents memory leaks
