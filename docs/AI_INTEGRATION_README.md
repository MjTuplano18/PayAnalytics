# AI Integration - Groq Client

## Overview

The AI Chat Assistant uses Groq's API for natural language processing. Groq provides fast inference using their LPU (Language Processing Unit) technology with models like Llama 3.3 70B.

## Implementation

### Components

1. **Base Client** (`app/services/ai/base_client.py`)
   - Abstract interface `AIAPIClient` 
   - `AIResponse` dataclass for structured responses
   - Defines contract for both standard and streaming responses

2. **Groq Client** (`app/services/ai/groq_client.py`)
   - Implements `AIAPIClient` using OpenAI-compatible API
   - Retry logic with exponential backoff (1s, 2s)
   - 30-second timeout
   - Supports both standard and streaming responses

3. **Factory** (`app/services/ai/factory.py`)
   - Creates AI client based on configuration
   - Singleton pattern for dependency injection
   - `get_ai_client()` for FastAPI endpoints

## Configuration

### Environment Variables

```env
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
```

### Available Models

- `llama-3.3-70b-versatile` (default) - Best for general tasks
- `llama-3.1-70b-versatile` - Alternative Llama model
- `mixtral-8x7b-32768` - Mixtral model with large context

## Usage

### Standard Response

```python
from app.services.ai.factory import get_ai_client

client = get_ai_client()

messages = [
    {"role": "system", "content": "You are a payment analytics assistant."},
    {"role": "user", "content": "What are the top banks this month?"}
]

response = await client.generate_response(messages, max_tokens=2000)

print(response.content)
print(f"Tokens used: {response.total_tokens}")
```

### Streaming Response

```python
from app.services.ai.factory import get_ai_client

client = get_ai_client()

messages = [
    {"role": "system", "content": "You are a payment analytics assistant."},
    {"role": "user", "content": "Explain payment trends."}
]

async for chunk in client.generate_streaming_response(messages):
    print(chunk, end="", flush=True)
```

## Testing

Run the test script to verify the integration:

```bash
cd backend
python test_groq_client.py
```

Expected output:
- Standard response test with token counts
- Streaming response test with real-time chunks

## Error Handling

The client implements automatic retry logic:
- 2 retry attempts with exponential backoff
- 1 second delay after first failure
- 2 second delay after second failure
- Raises exception after all retries exhausted

## Future Extensions

The factory pattern allows easy addition of other providers:
- OpenAI GPT-4 (placeholder exists)
- Anthropic Claude (placeholder exists)
- Any OpenAI-compatible API

To add a new provider:
1. Create client class implementing `AIAPIClient`
2. Add configuration to `config.py`
3. Update factory in `factory.py`

## API Limits

Groq free tier limits (as of 2024):
- 30 requests per minute
- 14,400 requests per day
- Rate limits are per API key

For production, consider:
- Implementing request queuing
- Adding rate limit monitoring
- Upgrading to paid tier if needed
