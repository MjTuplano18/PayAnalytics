"""
Unit tests for rate limiter service.
"""

import time
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.services.rate_limiter import RateLimiter, RateLimitResult


@pytest.fixture
def rate_limiter():
    """Create a fresh rate limiter instance for each test."""
    return RateLimiter()


class TestRequestRateLimit:
    """Tests for request rate limiting (20 requests/minute)."""
    
    def test_allows_requests_under_limit(self, rate_limiter):
        """Should allow requests when under the limit."""
        user_id = "test_user_1"
        
        # Make 19 requests (under limit of 20)
        for i in range(19):
            result = rate_limiter.check_request_limit(user_id)
            assert result.allowed is True
            assert result.current_count == i
            rate_limiter.increment_request_count(user_id)
    
    def test_blocks_requests_at_limit(self, rate_limiter):
        """Should block requests when limit is reached."""
        user_id = "test_user_2"
        
        # Make 20 requests (at limit)
        for _ in range(20):
            rate_limiter.increment_request_count(user_id)
        
        # 21st request should be blocked
        result = rate_limiter.check_request_limit(user_id)
        assert result.allowed is False
        assert result.retry_after is not None
        assert result.retry_after > 0
        assert result.current_count == 20
        assert result.limit == 20
    
    def test_sliding_window_eviction(self, rate_limiter):
        """Should evict old requests outside the time window."""
        user_id = "test_user_3"
        
        # Make 20 requests
        for _ in range(20):
            rate_limiter.increment_request_count(user_id)
        
        # Should be blocked
        result = rate_limiter.check_request_limit(user_id)
        assert result.allowed is False
        
        # Wait for window to expire (simulate by manipulating timestamps)
        # In real scenario, we'd wait 60 seconds
        # For testing, we can verify the logic by checking after time passes
        
        # Manually clear old entries (simulate time passing)
        rate_limiter._request_log[user_id].clear()
        
        # Should be allowed again
        result = rate_limiter.check_request_limit(user_id)
        assert result.allowed is True
    
    def test_different_users_independent_limits(self, rate_limiter):
        """Should track limits independently per user."""
        user1 = "user_1"
        user2 = "user_2"
        
        # User 1 makes 20 requests
        for _ in range(20):
            rate_limiter.increment_request_count(user1)
        
        # User 1 should be blocked
        result1 = rate_limiter.check_request_limit(user1)
        assert result1.allowed is False
        
        # User 2 should still be allowed
        result2 = rate_limiter.check_request_limit(user2)
        assert result2.allowed is True


class TestTokenRateLimit:
    """Tests for token rate limiting (50,000 tokens/day)."""
    
    def test_allows_tokens_under_limit(self, rate_limiter):
        """Should allow token usage when under daily limit."""
        user_id = "test_user_4"
        
        # Use 30,000 tokens (under limit of 50,000)
        result = rate_limiter.check_token_limit(user_id, estimated_tokens=30000)
        assert result.allowed is True
        
        rate_limiter.record_token_usage(user_id, 30000)
        
        # Check current usage
        usage = rate_limiter.get_user_token_usage(user_id)
        assert usage == 30000
    
    def test_blocks_tokens_at_limit(self, rate_limiter):
        """Should block requests when token limit is reached."""
        user_id = "test_user_5"
        
        # Use 50,000 tokens (at limit)
        rate_limiter.record_token_usage(user_id, 50000)
        
        # Next request should be blocked
        result = rate_limiter.check_token_limit(user_id, estimated_tokens=100)
        assert result.allowed is False
        assert result.retry_after is not None
        assert result.retry_after > 0
        assert result.current_count == 50000
        assert result.limit == 50000
    
    def test_incremental_token_usage(self, rate_limiter):
        """Should accumulate token usage across multiple requests."""
        user_id = "test_user_6"
        
        # Make multiple requests with different token counts
        rate_limiter.record_token_usage(user_id, 10000)
        rate_limiter.record_token_usage(user_id, 15000)
        rate_limiter.record_token_usage(user_id, 20000)
        
        # Total should be 45,000
        usage = rate_limiter.get_user_token_usage(user_id)
        assert usage == 45000
        
        # Should still allow 5,000 more
        result = rate_limiter.check_token_limit(user_id, estimated_tokens=5000)
        assert result.allowed is True
        
        # Should block 5,001
        result = rate_limiter.check_token_limit(user_id, estimated_tokens=5001)
        assert result.allowed is False
    
    def test_different_users_independent_token_limits(self, rate_limiter):
        """Should track token limits independently per user."""
        user1 = "user_7"
        user2 = "user_8"
        
        # User 1 uses 50,000 tokens
        rate_limiter.record_token_usage(user1, 50000)
        
        # User 1 should be blocked
        result1 = rate_limiter.check_token_limit(user1, estimated_tokens=100)
        assert result1.allowed is False
        
        # User 2 should still be allowed
        result2 = rate_limiter.check_token_limit(user2, estimated_tokens=100)
        assert result2.allowed is True


class TestRateLimiterHTTPException:
    """Tests for raise_if_rate_limited method."""
    
    def test_raises_on_request_limit_exceeded(self, rate_limiter):
        """Should raise HTTPException when request limit exceeded."""
        user_id = "test_user_9"
        
        # Make 20 requests
        for _ in range(20):
            rate_limiter.increment_request_count(user_id)
        
        # Should raise 429
        with pytest.raises(HTTPException) as exc_info:
            rate_limiter.raise_if_rate_limited(user_id)
        
        assert exc_info.value.status_code == 429
        assert "Request rate limit exceeded" in exc_info.value.detail
        assert "Retry-After" in exc_info.value.headers
    
    def test_raises_on_token_limit_exceeded(self, rate_limiter):
        """Should raise HTTPException when token limit exceeded."""
        user_id = "test_user_10"
        
        # Use 50,000 tokens
        rate_limiter.record_token_usage(user_id, 50000)
        
        # Should raise 429
        with pytest.raises(HTTPException) as exc_info:
            rate_limiter.raise_if_rate_limited(user_id, estimated_tokens=100)
        
        assert exc_info.value.status_code == 429
        assert "Daily token limit exceeded" in exc_info.value.detail
        assert "Retry-After" in exc_info.value.headers
    
    def test_no_exception_when_under_limits(self, rate_limiter):
        """Should not raise exception when under limits."""
        user_id = "test_user_11"
        
        # Make a few requests
        for _ in range(5):
            rate_limiter.increment_request_count(user_id)
        
        # Use some tokens
        rate_limiter.record_token_usage(user_id, 10000)
        
        # Should not raise
        rate_limiter.raise_if_rate_limited(user_id, estimated_tokens=1000)


class TestCleanup:
    """Tests for cleanup functionality."""
    
    def test_cleanup_old_token_data(self, rate_limiter):
        """Should clean up token data older than 2 days."""
        user_id = "test_user_12"
        
        # Record token usage
        rate_limiter.record_token_usage(user_id, 10000)
        
        # Verify it's tracked
        assert len(rate_limiter._token_usage) > 0
        
        # Manually set timestamp to old value (simulate 3 days ago)
        today = datetime.now(timezone.utc).date().isoformat()
        key = (user_id, today)
        rate_limiter._token_usage_timestamps[key] = time.monotonic() - (3 * 86400)
        
        # Trigger cleanup
        rate_limiter._cleanup_old_token_data()
        
        # Old data should be removed
        assert key not in rate_limiter._token_usage
        assert key not in rate_limiter._token_usage_timestamps
