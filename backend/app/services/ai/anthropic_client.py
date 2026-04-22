"""Anthropic Claude API client implementation."""

import asyncio
import os
from typing import AsyncGenerator

from anthropic import AsyncAnthropic
from anthropic import APIError, APITimeoutError, RateLimitError

from app.services.ai.base_client import AIAPIClient, AIResponse


class AnthropicClient(AIAPIClient):
    """Anthropic Claude API client implementation.
    
    This client implements the AIAPIClient interface for Anthropic's Claude model.
    It includes retry logic with exponential backoff and proper timeout handling.
    
    Configuration:
        - API key loaded from ANTHROPIC_API_KEY environment variable
        - Timeout: 30 seconds
        - Max tokens: 2000 (configurable)
        - Retry attempts: 2 with exponential backoff (1s, 2s)
    """
    
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "claude-3-opus-20240229",
        timeout: int = 30,
    ):
        """Initialize Anthropic client.
        
        Args:
            api_key: Anthropic API key. If None, loads from ANTHROPIC_API_KEY env var
            model: Model to use (default: 'claude-3-opus-20240229')
            timeout: Request timeout in seconds (default: 30)
        
        Raises:
            ValueError: If API key is not provided and not found in environment
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Anthropic API key must be provided or set in ANTHROPIC_API_KEY environment variable"
            )
        
        self.model = model
        self.timeout = timeout
        self.client = AsyncAnthropic(
            api_key=self.api_key,
            timeout=timeout,
        )
    
    def _convert_messages(
        self, messages: list[dict[str, str]]
    ) -> tuple[str, list[dict[str, str]]]:
        """Convert OpenAI-style messages to Anthropic format.
        
        Anthropic requires system messages to be separate from the messages list.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys
        
        Returns:
            Tuple of (system_prompt, converted_messages)
        """
        system_prompt = ""
        converted_messages = []
        
        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            
            if role == "system":
                # Extract system message
                system_prompt = content
            elif role in ("user", "assistant"):
                # Keep user and assistant messages
                converted_messages.append({
                    "role": role,
                    "content": content,
                })
        
        return system_prompt, converted_messages
    
    async def generate_response(
        self,
        messages: list[dict[str, str]],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AIResponse:
        """Generate a complete response from Anthropic Claude.
        
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
        
        # Convert messages to Anthropic format
        system_prompt, converted_messages = self._convert_messages(messages)
        
        for attempt, delay in enumerate(retry_delays + [0], start=1):
            try:
                response = await self.client.messages.create(
                    model=self.model,
                    system=system_prompt,
                    messages=converted_messages,  # type: ignore
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                
                # Extract response content
                content = ""
                if response.content:
                    # Anthropic returns a list of content blocks
                    for block in response.content:
                        if hasattr(block, "text"):
                            content += block.text
                
                # Extract token usage
                input_tokens = response.usage.input_tokens if response.usage else 0
                output_tokens = response.usage.output_tokens if response.usage else 0
                
                return AIResponse(
                    content=content,
                    model=response.model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    finish_reason=response.stop_reason or "unknown",
                )
            
            except (APIError, APITimeoutError, RateLimitError) as e:
                last_exception = e
                
                # If this is not the last attempt, wait before retrying
                if attempt <= len(retry_delays):
                    await asyncio.sleep(delay)
                    continue
                
                # All retries exhausted
                raise Exception(
                    f"Anthropic API call failed after {len(retry_delays) + 1} attempts: {str(e)}"
                ) from e
            
            except Exception as e:
                # Non-retryable error
                raise Exception(f"Anthropic API call failed: {str(e)}") from e
        
        # Should not reach here, but just in case
        raise Exception(
            f"Anthropic API call failed after retries: {str(last_exception)}"
        )
    
    async def generate_streaming_response(
        self,
        messages: list[dict[str, str]],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """Generate a streaming response from Anthropic Claude.
        
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
        
        # Convert messages to Anthropic format
        system_prompt, converted_messages = self._convert_messages(messages)
        
        for attempt, delay in enumerate(retry_delays + [0], start=1):
            try:
                async with self.client.messages.stream(
                    model=self.model,
                    system=system_prompt,
                    messages=converted_messages,  # type: ignore
                    max_tokens=max_tokens,
                    temperature=temperature,
                ) as stream:
                    async for text in stream.text_stream:
                        yield text
                
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
                    f"Anthropic streaming API call failed after {len(retry_delays) + 1} attempts: {str(e)}"
                ) from e
            
            except Exception as e:
                # Non-retryable error
                raise Exception(f"Anthropic streaming API call failed: {str(e)}") from e
        
        # Should not reach here, but just in case
        raise Exception(
            f"Anthropic streaming API call failed after retries: {str(last_exception)}"
        )
