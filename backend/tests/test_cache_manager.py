"""
Unit tests for cache manager service.
"""

import pytest

from app.core.cache import cache_clear
from app.services.cache_manager import CacheManager, CachedResponse


@pytest.fixture
def cache_manager():
    """Create a fresh cache manager instance for each test."""
    # Clear the underlying cache
    cache_clear()
    return CacheManager()


class TestQueryNormalization:
    """Tests for query normalization."""
    
    def test_lowercase_conversion(self, cache_manager):
        """Should convert query to lowercase."""
        query = "Show Me TOP Banks"
        normalized = cache_manager.normalize_query(query)
        assert normalized == "show me top banks"
    
    def test_whitespace_removal(self, cache_manager):
        """Should remove extra whitespace."""
        query = "show  me   top    banks"
        normalized = cache_manager.normalize_query(query)
        assert normalized == "show me top banks"
    
    def test_newline_and_tab_removal(self, cache_manager):
        """Should replace newlines and tabs with single space."""
        query = "show\nme\ttop\n\tbanks"
        normalized = cache_manager.normalize_query(query)
        assert normalized == "show me top banks"
    
    def test_leading_trailing_whitespace(self, cache_manager):
        """Should strip leading and trailing whitespace."""
        query = "  show me top banks  "
        normalized = cache_manager.normalize_query(query)
        assert normalized == "show me top banks"
    
    def test_combined_normalization(self, cache_manager):
        """Should apply all normalization steps."""
        query = "  Show  ME\n\tTOP   Banks  "
        normalized = cache_manager.normalize_query(query)
        assert normalized == "show me top banks"


class TestCacheOperations:
    """Tests for cache get/set operations."""
    
    def test_cache_miss(self, cache_manager):
        """Should return None for cache miss."""
        result = cache_manager.get_cached_response("test query", "user_1")
        assert result is None
    
    def test_cache_hit(self, cache_manager):
        """Should return cached response on cache hit."""
        user_id = "user_2"
        query = "show me top banks"
        response = "Here are the top banks..."
        
        # Cache the response
        cache_manager.cache_response(query, user_id, response)
        
        # Retrieve it
        cached = cache_manager.get_cached_response(query, user_id)
        assert cached is not None
        assert cached.response == response
    
    def test_cache_with_chart_metadata(self, cache_manager):
        """Should cache and retrieve chart metadata."""
        user_id = "user_3"
        query = "show me top banks"
        response = "Here are the top banks..."
        chart_metadata = {
            "type": "bar",
            "data": [100, 200, 300],
            "labels": ["Bank A", "Bank B", "Bank C"]
        }
        
        # Cache with metadata
        cache_manager.cache_response(query, user_id, response, chart_metadata)
        
        # Retrieve it
        cached = cache_manager.get_cached_response(query, user_id)
        assert cached is not None
        assert cached.response == response
        assert cached.chart_metadata == chart_metadata
    
    def test_normalized_queries_same_cache_key(self, cache_manager):
        """Should use same cache key for normalized equivalent queries."""
        user_id = "user_4"
        query1 = "show me top banks"
        query2 = "Show  ME   TOP  Banks"
        response = "Here are the top banks..."
        
        # Cache with first query
        cache_manager.cache_response(query1, user_id, response)
        
        # Retrieve with second query (should hit cache)
        cached = cache_manager.get_cached_response(query2, user_id)
        assert cached is not None
        assert cached.response == response
    
    def test_different_users_different_cache(self, cache_manager):
        """Should maintain separate caches per user."""
        user1 = "user_5"
        user2 = "user_6"
        query = "show me top banks"
        response1 = "User 1 response"
        response2 = "User 2 response"
        
        # Cache for both users
        cache_manager.cache_response(query, user1, response1)
        cache_manager.cache_response(query, user2, response2)
        
        # Each user should get their own response
        cached1 = cache_manager.get_cached_response(query, user1)
        cached2 = cache_manager.get_cached_response(query, user2)
        
        assert cached1.response == response1
        assert cached2.response == response2


class TestLRUEviction:
    """Tests for LRU eviction when cache limit exceeded."""
    
    def test_tracks_cache_size_per_user(self, cache_manager):
        """Should track number of cached entries per user."""
        user_id = "user_7"
        
        # Cache 5 different queries
        for i in range(5):
            cache_manager.cache_response(f"query {i}", user_id, f"response {i}")
        
        # Should have 5 entries
        size = cache_manager.get_user_cache_size(user_id)
        assert size == 5
    
    def test_lru_eviction_at_limit(self, cache_manager):
        """Should evict least recently used entry when limit exceeded."""
        user_id = "user_8"
        
        # Set a lower limit for testing
        original_limit = cache_manager.MAX_ENTRIES_PER_USER
        cache_manager.MAX_ENTRIES_PER_USER = 3
        
        try:
            # Cache 3 queries (at limit)
            cache_manager.cache_response("query 1", user_id, "response 1")
            cache_manager.cache_response("query 2", user_id, "response 2")
            cache_manager.cache_response("query 3", user_id, "response 3")
            
            # Should have 3 entries
            assert cache_manager.get_user_cache_size(user_id) == 3
            
            # Cache 4th query (should evict query 1)
            cache_manager.cache_response("query 4", user_id, "response 4")
            
            # Should still have 3 entries
            assert cache_manager.get_user_cache_size(user_id) == 3
            
            # Query 1 should be evicted (not in tracking)
            # Queries 2, 3, 4 should remain
            user_keys = cache_manager._user_cache_keys[user_id]
            cache_keys = list(user_keys.keys())
            
            # Verify we have 3 keys
            assert len(cache_keys) == 3
            
        finally:
            # Restore original limit
            cache_manager.MAX_ENTRIES_PER_USER = original_limit
    
    def test_lru_updates_on_access(self, cache_manager):
        """Should update LRU order when cache entry is accessed."""
        user_id = "user_9"
        
        # Set a lower limit for testing
        original_limit = cache_manager.MAX_ENTRIES_PER_USER
        cache_manager.MAX_ENTRIES_PER_USER = 3
        
        try:
            # Cache 3 queries
            cache_manager.cache_response("query 1", user_id, "response 1")
            cache_manager.cache_response("query 2", user_id, "response 2")
            cache_manager.cache_response("query 3", user_id, "response 3")
            
            # Access query 1 (should move to end)
            cache_manager.get_cached_response("query 1", user_id)
            
            # Cache query 4 (should evict query 2, not query 1)
            cache_manager.cache_response("query 4", user_id, "response 4")
            
            # Query 1 should still be accessible
            cached = cache_manager.get_cached_response("query 1", user_id)
            assert cached is not None
            
        finally:
            # Restore original limit
            cache_manager.MAX_ENTRIES_PER_USER = original_limit


class TestCacheInvalidation:
    """Tests for cache invalidation."""
    
    def test_invalidate_user_cache(self, cache_manager):
        """Should invalidate all cache entries for a user."""
        user_id = "user_10"
        
        # Cache multiple queries
        for i in range(5):
            cache_manager.cache_response(f"query {i}", user_id, f"response {i}")
        
        # Should have 5 entries
        assert cache_manager.get_user_cache_size(user_id) == 5
        
        # Invalidate
        count = cache_manager.invalidate_user_cache(user_id)
        assert count == 5
        
        # Should have 0 entries
        assert cache_manager.get_user_cache_size(user_id) == 0
    
    def test_invalidate_nonexistent_user(self, cache_manager):
        """Should handle invalidation of non-existent user gracefully."""
        count = cache_manager.invalidate_user_cache("nonexistent_user")
        assert count == 0


class TestCacheKeyGeneration:
    """Tests for cache key generation."""
    
    def test_cache_key_format(self, cache_manager):
        """Should generate cache keys in correct format."""
        user_id = "user_11"
        query = "test query"
        
        cache_key = cache_manager._generate_cache_key(user_id, query)
        
        # Should start with prefix
        assert cache_key.startswith("ai_chat:")
        
        # Should contain user_id
        assert user_id in cache_key
        
        # Should have hash component (16 chars)
        parts = cache_key.split(":")
        assert len(parts) == 3
        assert len(parts[2]) == 16  # Hash length
    
    def test_same_query_same_key(self, cache_manager):
        """Should generate same key for same query."""
        user_id = "user_12"
        query = "test query"
        
        key1 = cache_manager._generate_cache_key(user_id, query)
        key2 = cache_manager._generate_cache_key(user_id, query)
        
        assert key1 == key2
    
    def test_different_query_different_key(self, cache_manager):
        """Should generate different keys for different queries."""
        user_id = "user_13"
        query1 = "test query 1"
        query2 = "test query 2"
        
        key1 = cache_manager._generate_cache_key(user_id, query1)
        key2 = cache_manager._generate_cache_key(user_id, query2)
        
        assert key1 != key2
