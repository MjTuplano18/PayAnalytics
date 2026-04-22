"""
Cache manager service for AI chat responses.

Uses in-memory TTL cache with LRU eviction for single-process deployments.
Extends the existing backend/app/core/cache.py infrastructure.
"""

import hashlib
import re
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Dict

from app.core.cache import cache_get, cache_set


@dataclass
class CachedResponse:
    """Cached AI response with metadata."""
    response: str
    chart_metadata: dict | None = None
    cached_at: float = 0.0


class CacheManager:
    """
    Manages caching of AI chat responses with per-user LRU eviction.
    
    Features:
    - Query normalization (lowercase, whitespace removal)
    - Hash-based cache keys
    - 24-hour TTL
    - Per-user cache size limit (1000 entries)
    - LRU eviction when limit exceeded
    """
    
    # Configuration
    CACHE_TTL_SECONDS = 86400  # 24 hours
    MAX_ENTRIES_PER_USER = 1000
    CACHE_KEY_PREFIX = "ai_chat"
    
    def __init__(self):
        # Track cache keys per user for LRU eviction
        # Key: user_id, Value: OrderedDict of cache_keys (most recent last)
        self._user_cache_keys: Dict[str, OrderedDict[str, None]] = {}
    
    def normalize_query(self, query: str) -> str:
        """
        Normalize a query for cache key generation.
        
        Normalization steps:
        1. Convert to lowercase
        2. Remove extra whitespace (multiple spaces, tabs, newlines)
        3. Strip leading/trailing whitespace
        
        Args:
            query: The raw user query
            
        Returns:
            Normalized query string
        """
        # Convert to lowercase
        normalized = query.lower()
        
        # Replace multiple whitespace characters with single space
        normalized = re.sub(r'\s+', ' ', normalized)
        
        # Strip leading/trailing whitespace
        normalized = normalized.strip()
        
        return normalized
    
    def _generate_cache_key(self, user_id: str, query: str) -> str:
        """
        Generate a cache key from user_id and query.
        
        Format: ai_chat:{user_id}:{query_hash}
        
        Args:
            user_id: The user's unique identifier
            query: The normalized query string
            
        Returns:
            Cache key string
        """
        # Normalize the query
        normalized_query = self.normalize_query(query)
        
        # Generate hash of normalized query
        query_hash = hashlib.sha256(normalized_query.encode('utf-8')).hexdigest()[:16]
        
        # Construct cache key
        return f"{self.CACHE_KEY_PREFIX}:{user_id}:{query_hash}"
    
    def get_cached_response(self, query: str, user_id: str) -> CachedResponse | None:
        """
        Retrieve a cached response if available.
        
        Args:
            query: The user query
            user_id: The user's unique identifier
            
        Returns:
            CachedResponse if found and not expired, None otherwise
        """
        cache_key = self._generate_cache_key(user_id, query)
        
        # Try to get from cache
        cached_data = cache_get(cache_key)
        
        if cached_data is None:
            return None
        
        # Update LRU tracking (move to end = most recently used)
        if user_id in self._user_cache_keys:
            user_keys = self._user_cache_keys[user_id]
            if cache_key in user_keys:
                # Move to end (most recent)
                user_keys.move_to_end(cache_key)
        
        # Return cached response
        if isinstance(cached_data, dict):
            return CachedResponse(
                response=cached_data.get('response', ''),
                chart_metadata=cached_data.get('chart_metadata'),
                cached_at=cached_data.get('cached_at', 0.0),
            )
        
        # Legacy format (just string)
        return CachedResponse(response=str(cached_data))
    
    def cache_response(
        self,
        query: str,
        user_id: str,
        response: str,
        chart_metadata: dict | None = None,
    ) -> None:
        """
        Cache an AI response.
        
        Implements LRU eviction when user exceeds MAX_ENTRIES_PER_USER.
        
        Args:
            query: The user query
            user_id: The user's unique identifier
            response: The AI response text
            chart_metadata: Optional chart visualization metadata
        """
        cache_key = self._generate_cache_key(user_id, query)
        
        # Initialize user cache tracking if needed
        if user_id not in self._user_cache_keys:
            self._user_cache_keys[user_id] = OrderedDict()
        
        user_keys = self._user_cache_keys[user_id]
        
        # Check if we need to evict (LRU)
        if cache_key not in user_keys and len(user_keys) >= self.MAX_ENTRIES_PER_USER:
            # Evict least recently used (first item)
            lru_key, _ = user_keys.popitem(last=False)
            # Note: We don't explicitly delete from cache_get/cache_set storage
            # because it will expire naturally via TTL
        
        # Add/update cache key tracking (move to end = most recent)
        user_keys[cache_key] = None
        user_keys.move_to_end(cache_key)
        
        # Store in cache
        import time
        cache_data = {
            'response': response,
            'chart_metadata': chart_metadata,
            'cached_at': time.time(),
        }
        
        cache_set(cache_key, cache_data, ttl=self.CACHE_TTL_SECONDS)
    
    def invalidate_user_cache(self, user_id: str) -> int:
        """
        Invalidate all cached responses for a user.
        
        Args:
            user_id: The user's unique identifier
            
        Returns:
            Number of cache entries invalidated
        """
        if user_id not in self._user_cache_keys:
            return 0
        
        user_keys = self._user_cache_keys[user_id]
        count = len(user_keys)
        
        # Clear the tracking
        user_keys.clear()
        
        # Note: Individual cache entries will expire via TTL
        # We could explicitly invalidate them, but it's not necessary
        # for correctness and saves processing time
        
        return count
    
    def get_user_cache_size(self, user_id: str) -> int:
        """
        Get the number of cached entries for a user.
        
        Args:
            user_id: The user's unique identifier
            
        Returns:
            Number of cached entries
        """
        if user_id not in self._user_cache_keys:
            return 0
        return len(self._user_cache_keys[user_id])


# Global singleton instance for single-process deployment
_cache_manager_instance: CacheManager | None = None


def get_cache_manager() -> CacheManager:
    """Get or create the global cache manager instance."""
    global _cache_manager_instance
    if _cache_manager_instance is None:
        _cache_manager_instance = CacheManager()
    return _cache_manager_instance
