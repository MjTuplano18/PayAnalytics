"""
Integration tests for rate limiter and cache manager working together.

These tests demonstrate how the services would be used in the actual
AI chat endpoint implementation.
"""

import pytest
from fastapi import HTTPException

from app.core.cache import cache_clear
from app.services.cache_manager import CacheManager
from app.services.rate_limiter import RateLimiter


@pytest.fixture
def rate_limiter():
    """Create a fresh rate limiter instance."""
    return RateLimiter()


@pytest.fixture
def cache_manager():
    """Create a fresh cache manager instance."""
    cache_clear()
    return CacheManager()


class TestIntegration:
    """Integration tests for rate limiting and caching."""
    
    def test_typical_query_flow(self, rate_limiter, cache_manager):
        """
        Test a typical query flow:
        1. Check rate limits
        2. Check cache (miss)
        3. Process query (simulated)
        4. Cache response
        5. Increment counters
        """
        user_id = "user_1"
        query = "Show me top banks"
        
        # Step 1: Check rate limits (should pass)
        rate_limiter.raise_if_rate_limited(user_id, estimated_tokens=1000)
        
        # Step 2: Check cache (should miss)
        cached = cache_manager.get_cached_response(query, user_id)
        assert cached is None
        
        # Step 3: Process query (simulated)
        response = "Here are the top banks: Bank A, Bank B, Bank C"
        tokens_used = 150
        
        # Step 4: Cache response
        cache_manager.cache_response(query, user_id, response)
        
        # Step 5: Increment counters
        rate_limiter.increment_request_count(user_id)
        rate_limiter.record_token_usage(user_id, tokens_used)
        
        # Verify cache hit on second request
        cached = cache_manager.get_cached_response(query, user_id)
        assert cached is not None
        assert cached.response == response
        
        # Verify rate limit tracking
        usage = rate_limiter.get_user_token_usage(user_id)
        assert usage == tokens_used
    
    def test_cache_hit_skips_processing(self, rate_limiter, cache_manager):
        """
        Test that cache hits skip AI processing but still count toward rate limits.
        """
        user_id = "user_2"
        query = "Show me payment trends"
        response = "Payment trends are increasing..."
        
        # First request: cache miss, process and cache
        rate_limiter.raise_if_rate_limited(user_id, estimated_tokens=1000)
        cache_manager.cache_response(query, user_id, response)
        rate_limiter.increment_request_count(user_id)
        rate_limiter.record_token_usage(user_id, 200)
        
        # Second request: cache hit
        rate_limiter.raise_if_rate_limited(user_id, estimated_tokens=0)  # No tokens needed
        cached = cache_manager.get_cached_response(query, user_id)
        assert cached is not None
        assert cached.response == response
        
        # Still increment request count (but not tokens)
        rate_limiter.increment_request_count(user_id)
        
        # Verify: 2 requests, but only 200 tokens
        result = rate_limiter.check_request_limit(user_id)
        assert result.current_count == 2
        
        usage = rate_limiter.get_user_token_usage(user_id)
        assert usage == 200  # Only from first request
    
    def test_rate_limit_blocks_before_cache_check(self, rate_limiter, cache_manager):
        """
        Test that rate limiting happens before cache check.
        """
        user_id = "user_3"
        query = "Show me data"
        
        # Make 20 requests to hit the limit
        for _ in range(20):
            rate_limiter.increment_request_count(user_id)
        
        # 21st request should be blocked even if cached
        with pytest.raises(HTTPException) as exc_info:
            rate_limiter.raise_if_rate_limited(user_id)
        
        assert exc_info.value.status_code == 429
        
        # Cache check would never happen in real flow
    
    def test_normalized_queries_share_cache(self, rate_limiter, cache_manager):
        """
        Test that normalized queries share the same cache entry.
        """
        user_id = "user_4"
        query1 = "show me top banks"
        query2 = "Show  ME   TOP  Banks"
        response = "Top banks data..."
        
        # First request with query1
        rate_limiter.raise_if_rate_limited(user_id, estimated_tokens=1000)
        cache_manager.cache_response(query1, user_id, response)
        rate_limiter.increment_request_count(user_id)
        rate_limiter.record_token_usage(user_id, 150)
        
        # Second request with query2 (normalized to same as query1)
        rate_limiter.raise_if_rate_limited(user_id, estimated_tokens=0)
        cached = cache_manager.get_cached_response(query2, user_id)
        
        # Should hit cache
        assert cached is not None
        assert cached.response == response
        
        # Only one AI call, so only 150 tokens
        usage = rate_limiter.get_user_token_usage(user_id)
        assert usage == 150
    
    def test_multiple_users_independent(self, rate_limiter, cache_manager):
        """
        Test that multiple users have independent rate limits and caches.
        """
        user1 = "user_5"
        user2 = "user_6"
        query = "show me data"
        
        # User 1 makes requests
        for i in range(10):
            rate_limiter.raise_if_rate_limited(user1, estimated_tokens=1000)
            rate_limiter.increment_request_count(user1)
            rate_limiter.record_token_usage(user1, 100)
        
        cache_manager.cache_response(query, user1, "User 1 response")
        
        # User 2 makes requests
        for i in range(5):
            rate_limiter.raise_if_rate_limited(user2, estimated_tokens=1000)
            rate_limiter.increment_request_count(user2)
            rate_limiter.record_token_usage(user2, 100)
        
        cache_manager.cache_response(query, user2, "User 2 response")
        
        # Verify independent tracking
        result1 = rate_limiter.check_request_limit(user1)
        result2 = rate_limiter.check_request_limit(user2)
        
        assert result1.current_count == 10
        assert result2.current_count == 5
        
        usage1 = rate_limiter.get_user_token_usage(user1)
        usage2 = rate_limiter.get_user_token_usage(user2)
        
        assert usage1 == 1000
        assert usage2 == 500
        
        # Verify independent caches
        cached1 = cache_manager.get_cached_response(query, user1)
        cached2 = cache_manager.get_cached_response(query, user2)
        
        assert cached1.response == "User 1 response"
        assert cached2.response == "User 2 response"
