"""Abstract base class for AI API clients."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator


@dataclass
class AIResponse:
    """Structured response from AI API."""
    
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    finish_reason: str | None = None


class AIAPIClient(ABC):
    """Abstract interface for AI service providers."""
    
    @abstractmethod
    async def generate_response(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AIResponse:
        """
        Generate a response from the AI model.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature (0.0-1.0)
            
        Returns:
            AIResponse with content and token usage
            
        Raises:
            Exception: If API call fails after retries
        """
        pass
    
    @abstractmethod
    async def generate_streaming_response(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """
        Generate a streaming response from the AI model.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature (0.0-1.0)
            
        Yields:
            Response chunks as they arrive
            
        Raises:
            Exception: If API call fails after retries
        """
        pass
