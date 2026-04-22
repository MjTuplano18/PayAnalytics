"""
Rate limiter service for AI chat requests.

Uses in-memory sliding window algorithm for single-process deployments.
Tracks both request counts (20/minute) and token usage (50k/day).
"""

import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Deque

from fastapi import HTTPException, status


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""
    allowed: bool
    retry_after: int | None = None  # Seconds until limit resets
    current_count: int = 0
    limit: int = 0


class RateLimiter:
    """
    In-memory rate limiter using sliding window algorithm.
    
    Enforces:
    - 20 requests per minute per user
    - 50,000 tokens per day per user
    """
    
    # Configuration
    REQUEST_LIMIT_PER_MINUTE = 20
    REQUEST_WINDOW_SECONDS = 60
    TOKEN_LIMIT_PER_DAY = 50000
    TOKEN_WINDOW_SECONDS = 86400  # 24 hours
    
    def __init__(self):
        # Stores timestamps of recent requests keyed by user_id
        self._request_log: Dict[str, Deque[float]] = defaultdict(deque)
        
        # Stores token usage per user per day
        # Key: (user_id, date_str), Value: token count
        self._token_usage: Dict[tuple[str, str], int] = defaultdict(int)
        
        # Track when token usage was last recorded for cleanup
        self._token_usage_timestamps: Dict[tuple[str, str], float] = {}
    
    def check_request_limit(self, user_id: str) -> RateLimitResult:
        """
        Check if user is within request rate limit (20 requests/minute).
        
        Args:
            user_id: The user's unique identifier
            
        Returns:
            RateLimitResult with allowed status and retry information
        """
        now = time.monotonic()
        window = self.REQUEST_WINDOW_SECONDS
        max_requests = self.REQUEST_LIMIT_PER_MINUTE
        
        log = self._request_log[user_id]
        
        # Evict timestamps older than the window
        while log and log[0] < now - window:
            log.popleft()
        
        current_count = len(log)
        
        if current_count >= max_requests:
            # Calculate retry-after based on oldest request in window
            oldest_request = log[0]
            retry_after = int(window - (now - oldest_request)) + 1
            
            return RateLimitResult(
                allowed=False,
                retry_after=retry_after,
                current_count=current_count,
                limit=max_requests,
            )
        
        return RateLimitResult(
            allowed=True,
            current_count=current_count,
            limit=max_requests,
        )
    
    def check_token_limit(self, user_id: str, estimated_tokens: int = 0) -> RateLimitResult:
        """
        Check if user is within daily token limit (50,000 tokens/day).
        
        Args:
            user_id: The user's unique identifier
            estimated_tokens: Estimated tokens for the current request
            
        Returns:
            RateLimitResult with allowed status and retry information
        """
        today = datetime.now(timezone.utc).date().isoformat()
        key = (user_id, today)
        
        # Clean up old token usage data (older than 2 days)
        self._cleanup_old_token_data()
        
        current_usage = self._token_usage[key]
        projected_usage = current_usage + estimated_tokens
        
        if projected_usage > self.TOKEN_LIMIT_PER_DAY:
            # Calculate retry-after (seconds until next day UTC)
            now = datetime.now(timezone.utc)
            tomorrow = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
            retry_after = int((tomorrow - now).total_seconds())
            
            return RateLimitResult(
                allowed=False,
                retry_after=retry_after,
                current_count=current_usage,
                limit=self.TOKEN_LIMIT_PER_DAY,
            )
        
        return RateLimitResult(
            allowed=True,
            current_count=current_usage,
            limit=self.TOKEN_LIMIT_PER_DAY,
        )
    
    def increment_request_count(self, user_id: str) -> None:
        """
        Increment the request counter for a user.
        
        Args:
            user_id: The user's unique identifier
        """
        now = time.monotonic()
        self._request_log[user_id].append(now)
    
    def record_token_usage(self, user_id: str, tokens_used: int) -> None:
        """
        Record token usage for a user.
        
        Args:
            user_id: The user's unique identifier
            tokens_used: Number of tokens consumed in the request
        """
        today = datetime.now(timezone.utc).date().isoformat()
        key = (user_id, today)
        
        self._token_usage[key] += tokens_used
        self._token_usage_timestamps[key] = time.monotonic()
    
    def get_user_token_usage(self, user_id: str) -> int:
        """
        Get current token usage for a user today.
        
        Args:
            user_id: The user's unique identifier
            
        Returns:
            Total tokens used today
        """
        today = datetime.now(timezone.utc).date().isoformat()
        key = (user_id, today)
        return self._token_usage[key]
    
    def _cleanup_old_token_data(self) -> None:
        """Remove token usage data older than 2 days to prevent memory bloat."""
        now = time.monotonic()
        cutoff = now - (2 * self.TOKEN_WINDOW_SECONDS)
        
        keys_to_remove = [
            key for key, timestamp in self._token_usage_timestamps.items()
            if timestamp < cutoff
        ]
        
        for key in keys_to_remove:
            self._token_usage.pop(key, None)
            self._token_usage_timestamps.pop(key, None)
    
    def raise_if_rate_limited(self, user_id: str, estimated_tokens: int = 0) -> None:
        """
        Check rate limits and raise HTTPException if exceeded.
        
        Args:
            user_id: The user's unique identifier
            estimated_tokens: Estimated tokens for the current request
            
        Raises:
            HTTPException: 429 Too Many Requests if limits exceeded
        """
        # Check request rate limit
        request_result = self.check_request_limit(user_id)
        if not request_result.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Request rate limit exceeded. "
                    f"Maximum {self.REQUEST_LIMIT_PER_MINUTE} requests per minute. "
                    f"Please try again in {request_result.retry_after} seconds."
                ),
                headers={"Retry-After": str(request_result.retry_after)},
            )
        
        # Check token limit
        token_result = self.check_token_limit(user_id, estimated_tokens)
        if not token_result.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Daily token limit exceeded. "
                    f"Maximum {self.TOKEN_LIMIT_PER_DAY} tokens per day. "
                    f"Current usage: {token_result.current_count} tokens. "
                    f"Limit resets in {token_result.retry_after} seconds."
                ),
                headers={"Retry-After": str(token_result.retry_after)},
            )


# Global singleton instance for single-process deployment
_rate_limiter_instance: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    """Get or create the global rate limiter instance."""
    global _rate_limiter_instance
    if _rate_limiter_instance is None:
        _rate_limiter_instance = RateLimiter()
    return _rate_limiter_instance
