"""Groq AI API client implementation."""

import asyncio
import os
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.services.ai.base_client import AIAPIClient, AIResponse


class GroqClient(AIAPIClient):
    """Groq AI API client using OpenAI-compatible interface."""
    
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "llama-3.3-70b-versatile",
        timeout: int = 30,
        max_retries: int = 2,
    ):
        """
        Initialize Groq client.
        
        Args:
            api_key: Groq API key (defaults to GROQ_API_KEY env var)
            model: Model to use for completions
            timeout: Request timeout in seconds
            max_retries: Number of retry attempts
        """
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        if not self.api_key:
            raise ValueError("GROQ_API_KEY must be provided or set in environment")
        
        self.model = model
        self.timeout = timeout
        self.max_retries = max_retries
        
        # Initialize OpenAI client with Groq endpoint
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url="https://api.groq.com/openai/v1",
            timeout=timeout,
        )
    
    async def generate_response(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AIResponse:
        """
        Generate a response from Groq API.
        
        Implements retry logic with exponential backoff (1s, 2s).
        """
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                
                # Extract response data
                choice = response.choices[0]
                usage = response.usage
                
                return AIResponse(
                    content=choice.message.content or "",
                    model=response.model,
                    input_tokens=usage.prompt_tokens,
                    output_tokens=usage.completion_tokens,
                    total_tokens=usage.total_tokens,
                    finish_reason=choice.finish_reason,
                )
                
            except Exception as e:
                last_exception = e
                
                # Don't retry on last attempt
                if attempt < self.max_retries:
                    # Exponential backoff: 1s, 2s
                    wait_time = 2 ** attempt
                    await asyncio.sleep(wait_time)
                    continue
                
                # All retries exhausted
                raise Exception(
                    f"Groq API call failed after {self.max_retries + 1} attempts: {str(e)}"
                ) from last_exception
    
    async def generate_streaming_response(
        self,
        messages: list[dict],
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """
        Generate a streaming response from Groq API.
        
        Implements retry logic with exponential backoff (1s, 2s).
        """
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                stream = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                )
                
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                
                # Successfully completed streaming
                return
                
            except Exception as e:
                last_exception = e
                
                # Don't retry on last attempt
                if attempt < self.max_retries:
                    # Exponential backoff: 1s, 2s
                    wait_time = 2 ** attempt
                    await asyncio.sleep(wait_time)
                    continue
                
                # All retries exhausted
                raise Exception(
                    f"Groq streaming API call failed after {self.max_retries + 1} attempts: {str(e)}"
                ) from last_exception
