"""OpenAI API client implementation."""

import asyncio
import os
from typing import AsyncGenerator

from openai import AsyncOpenAI
from openai import APIError, APITimeoutError, RateLimitError

from app.services.ai.base_client import AIAPIClient, AIResponse


class OpenAIClient(AIAPIClient):
    """OpenAI GPT-4 API client implementation.
    
    This client implements the AIAPIClient interface for OpenAI's GPT-4 model.
    It includes retry logic with exponential backoff and proper timeout handling.
    
    Configuration:
        - API key loaded from OPENAI_API_KEY environment variable
        - Timeout: 30 seconds
        - Max tokens: 2000 (configurable)
        - Retry attempts: 2 with exponential backoff (1s, 2s)
    """
    
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-4",
        timeout: int = 30,
    ):
        """Initialize OpenAI client.
        
        Args:
            api_key: OpenAI API key. If None, loads from OPENAI_API_KEY env var
            model: Model to use (default: 'gpt-4')
            timeout: Request timeout in seconds (default: 30)
        
        Raises:
            ValueError: If API key is not provided and not found in environment
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "OpenAI API key must be provided or set in OPENAI_API_KEY environment variable"
            )
        
        self.model = model
        self.timeout = timeout
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            timeout=timeout,
        )
    
    async def generate_response(
        self,
        messages: list[dict[str, str]],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AIResponse:
        """Generate a complete response from OpenAI GPT-4.
        
        Implements retry logic with exponential backoff (1s, 2s).
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
            max_tokens: Maximum tokens to generate (default: 2000)
            temperature: Sampling temperature (default: 0.7)
        
        Returns:
            AIResponse with generated content and metadata
        
        Raises:
            Exception: If all retry attempts fail
        """
        retry_delays = [1, 2]  # Exponential backoff: 1s, 2s
        last_exception = None
        
        for attempt, delay in enumerate(retry_delays + [0], start=1):
            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,  # type: ignore
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                
                # Extract response data
                choice = response.choices[0]
                content = choice.message.content or ""
                finish_reason = choice.finish_reason or "unknown"
                
                # Extract token usage
                usage = response.usage
                input_tokens = usage.prompt_tokens if usage else 0
                output_tokens = usage.completion_tokens if usage else 0
                
                return AIResponse(
                    content=content,
                    model=response.model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    finish_reason=finish_reason,
                )
            
            except (APIError, APITimeoutError, RateLimitError) as e:
                last_exception = e
                
                # If this is not the last attempt, wait before retrying
                if attempt <= len(retry_delays):
                    await asyncio.sleep(delay)
                    continue
                
                # All retries exhausted
                raise Exception(
                    f"OpenAI API call failed after {len(retry_delays) + 1} attempts: {str(e)}"
                ) from e
            
            except Exception as e:
                # Non-retryable error
                raise Exception(f"OpenAI API call failed: {str(e)}") from e
        
        # Should not reach here, but just in case
        raise Exception(
            f"OpenAI API call failed after retries: {str(last_exception)}"
        )
    
    async def generate_streaming_response(
        self,
        messages: list[dict[str, str]],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Generate a streaming response from OpenAI GPT-4.
        
        Yields response chunks as they arrive from the API.
        Implements retry logic with exponential backoff (1s, 2s).
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
            max_tokens: Maximum tokens to generate (default: 2000)
            temperature: Sampling temperature (default: 0.7)
        
        Yields:
            String chunks of the response
        
        Raises:
            Exception: If all retry attempts fail
        """
        retry_delays = [1, 2]  # Exponential backoff: 1s, 2s
        last_exception = None
        
        for attempt, delay in enumerate(retry_delays + [0], start=1):
            try:
                stream = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,  # type: ignore
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                )
                
                async for chunk in stream:
                    if chunk.choices:
                        delta = chunk.choices[0].delta
                        if delta.content:
                            yield delta.content
                
                # Successfully completed streaming
                return
            
            except (APIError, APITimeoutError, RateLimitError) as e:
                last_exception = e
                
                # If this is not the last attempt, wait before retrying
                if attempt <= len(retry_delays):
                    await asyncio.sleep(delay)
                    continue
                
                # All retries exhausted
                raise Exception(
                    f"OpenAI streaming API call failed after {len(retry_delays) + 1} attempts: {str(e)}"
                ) from e
            
            except Exception as e:
                # Non-retryable error
                raise Exception(f"OpenAI streaming API call failed: {str(e)}") from e
        
        # Should not reach here, but just in case
        raise Exception(
            f"OpenAI streaming API call failed after retries: {str(last_exception)}"
        )
