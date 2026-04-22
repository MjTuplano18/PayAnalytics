"""Unit tests for AI client implementations."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ai.base_client import AIResponse
from app.services.ai.openai_client import OpenAIClient
from app.services.ai.anthropic_client import AnthropicClient
from app.services.ai.groq_client import GroqClient
from app.services.ai.factory import create_ai_client


class TestOpenAIClient:
    """Tests for OpenAI client implementation."""
    
    def test_init_with_api_key(self):
        """Test OpenAI client initialization with API key."""
        client = OpenAIClient(api_key="test-key")
        assert client.api_key == "test-key"
        assert client.model == "gpt-4"
        assert client.timeout == 30
    
    def test_init_without_api_key_raises_error(self):
        """Test OpenAI client initialization without API key raises ValueError."""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="OpenAI API key must be provided"):
                OpenAIClient()
    
    @pytest.mark.asyncio
    async def test_generate_response_success(self):
        """Test successful response generation."""
        client = OpenAIClient(api_key="test-key")
        
        # Mock the OpenAI API response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.model = "gpt-4"
        mock_response.usage = MagicMock()
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 20
        
        client.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        messages = [{"role": "user", "content": "Hello"}]
        response = await client.generate_response(messages)
        
        assert isinstance(response, AIResponse)
        assert response.content == "Test response"
        assert response.model == "gpt-4"
        assert response.input_tokens == 10
        assert response.output_tokens == 20
        assert response.finish_reason == "stop"
    
    @pytest.mark.asyncio
    async def test_generate_streaming_response_success(self):
        """Test successful streaming response generation."""
        client = OpenAIClient(api_key="test-key")
        
        # Mock streaming response
        async def mock_stream():
            chunks = ["Hello", " ", "world"]
            for chunk_text in chunks:
                mock_chunk = MagicMock()
                mock_chunk.choices = [MagicMock()]
                mock_chunk.choices[0].delta.content = chunk_text
                yield mock_chunk
        
        client.client.chat.completions.create = AsyncMock(return_value=mock_stream())
        
        messages = [{"role": "user", "content": "Hello"}]
        chunks = []
        async for chunk in client.generate_streaming_response(messages):
            chunks.append(chunk)
        
        assert chunks == ["Hello", " ", "world"]


class TestAnthropicClient:
    """Tests for Anthropic client implementation."""
    
    def test_init_with_api_key(self):
        """Test Anthropic client initialization with API key."""
        client = AnthropicClient(api_key="test-key")
        assert client.api_key == "test-key"
        assert client.model == "claude-3-opus-20240229"
        assert client.timeout == 30
    
    def test_init_without_api_key_raises_error(self):
        """Test Anthropic client initialization without API key raises ValueError."""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="Anthropic API key must be provided"):
                AnthropicClient()
    
    def test_convert_messages(self):
        """Test message conversion from OpenAI format to Anthropic format."""
        client = AnthropicClient(api_key="test-key")
        
        messages = [
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ]
        
        system_prompt, converted = client._convert_messages(messages)
        
        assert system_prompt == "You are a helpful assistant"
        assert len(converted) == 2
        assert converted[0] == {"role": "user", "content": "Hello"}
        assert converted[1] == {"role": "assistant", "content": "Hi there"}
    
    @pytest.mark.asyncio
    async def test_generate_response_success(self):
        """Test successful response generation."""
        client = AnthropicClient(api_key="test-key")
        
        # Mock the Anthropic API response
        mock_response = MagicMock()
        mock_content_block = MagicMock()
        mock_content_block.text = "Test response"
        mock_response.content = [mock_content_block]
        mock_response.model = "claude-3-opus-20240229"
        mock_response.stop_reason = "end_turn"
        mock_response.usage = MagicMock()
        mock_response.usage.input_tokens = 10
        mock_response.usage.output_tokens = 20
        
        client.client.messages.create = AsyncMock(return_value=mock_response)
        
        messages = [{"role": "user", "content": "Hello"}]
        response = await client.generate_response(messages)
        
        assert isinstance(response, AIResponse)
        assert response.content == "Test response"
        assert response.model == "claude-3-opus-20240229"
        assert response.input_tokens == 10
        assert response.output_tokens == 20
        assert response.finish_reason == "end_turn"


class TestGroqClient:
    """Tests for Groq client implementation."""
    
    def test_init_with_api_key(self):
        """Test Groq client initialization with API key."""
        client = GroqClient(api_key="test-key")
        assert client.api_key == "test-key"
        assert client.model == "llama-3.3-70b-versatile"
        assert client.timeout == 30
    
    def test_init_without_api_key_raises_error(self):
        """Test Groq client initialization without API key raises ValueError."""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="GROQ_API_KEY must be provided or set in environment"):
                GroqClient()
    
    @pytest.mark.asyncio
    async def test_generate_response_success(self):
        """Test successful response generation."""
        client = GroqClient(api_key="test-key")
        
        # Mock the Groq API response (uses OpenAI-compatible format)
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.model = "llama-3.3-70b-versatile"
        mock_response.usage = MagicMock()
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 20
        
        client.client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        messages = [{"role": "user", "content": "Hello"}]
        response = await client.generate_response(messages)
        
        assert isinstance(response, AIResponse)
        assert response.content == "Test response"
        assert response.model == "llama-3.3-70b-versatile"
        assert response.input_tokens == 10
        assert response.output_tokens == 20
        assert response.finish_reason == "stop"
    
    @pytest.mark.asyncio
    async def test_generate_streaming_response_success(self):
        """Test successful streaming response generation."""
        client = GroqClient(api_key="test-key")
        
        # Mock streaming response
        async def mock_stream():
            chunks = ["Hello", " ", "world"]
            for chunk_text in chunks:
                mock_chunk = MagicMock()
                mock_chunk.choices = [MagicMock()]
                mock_chunk.choices[0].delta.content = chunk_text
                yield mock_chunk
        
        client.client.chat.completions.create = AsyncMock(return_value=mock_stream())
        
        messages = [{"role": "user", "content": "Hello"}]
        chunks = []
        async for chunk in client.generate_streaming_response(messages):
            chunks.append(chunk)
        
        assert chunks == ["Hello", " ", "world"]


class TestAIClientFactory:
    """Tests for AI client factory."""
    
    @patch("app.services.ai.factory.settings")
    def test_create_openai_client(self, mock_settings):
        """Test factory creates OpenAI client when configured."""
        mock_settings.AI_PROVIDER = "openai"
        mock_settings.OPENAI_API_KEY = "test-key"
        
        client = create_ai_client()
        
        assert isinstance(client, OpenAIClient)
    
    @patch("app.services.ai.factory.settings")
    def test_create_anthropic_client(self, mock_settings):
        """Test factory creates Anthropic client when configured."""
        mock_settings.AI_PROVIDER = "anthropic"
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        
        client = create_ai_client()
        
        assert isinstance(client, AnthropicClient)
    
    @patch("app.services.ai.factory.settings")
    def test_create_groq_client(self, mock_settings):
        """Test factory creates Groq client when configured."""
        mock_settings.AI_PROVIDER = "groq"
        mock_settings.GROQ_API_KEY = "test-key"
        
        client = create_ai_client()
        
        assert isinstance(client, GroqClient)
    
    @patch("app.services.ai.factory.settings")
    def test_create_client_invalid_provider(self, mock_settings):
        """Test factory raises error for invalid provider."""
        mock_settings.AI_PROVIDER = "invalid"
        
        with pytest.raises(ValueError, match="Unsupported AI provider"):
            create_ai_client()

