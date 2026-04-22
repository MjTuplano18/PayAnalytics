"""Test script for Groq AI client."""

import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.ai.factory import create_ai_client


async def test_standard_response():
    """Test standard (non-streaming) response."""
    print("Testing standard response...")
    
    client = create_ai_client()
    
    messages = [
        {"role": "system", "content": "You are a helpful payment analytics assistant."},
        {"role": "user", "content": "What is the capital of France?"}
    ]
    
    try:
        response = await client.generate_response(messages, max_tokens=100)
        
        print(f"\n✓ Response received:")
        print(f"  Model: {response.model}")
        print(f"  Content: {response.content}")
        print(f"  Tokens: {response.input_tokens} input + {response.output_tokens} output = {response.total_tokens} total")
        print(f"  Finish reason: {response.finish_reason}")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        raise


async def test_streaming_response():
    """Test streaming response."""
    print("\n\nTesting streaming response...")
    
    client = create_ai_client()
    
    messages = [
        {"role": "system", "content": "You are a helpful payment analytics assistant."},
        {"role": "user", "content": "Count from 1 to 5."}
    ]
    
    try:
        print("\n✓ Streaming chunks:")
        print("  ", end="", flush=True)
        
        async for chunk in client.generate_streaming_response(messages, max_tokens=100):
            print(chunk, end="", flush=True)
        
        print("\n")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        raise


async def main():
    """Run all tests."""
    print("=" * 60)
    print("Groq AI Client Test")
    print("=" * 60)
    
    await test_standard_response()
    await test_streaming_response()
    
    print("\n" + "=" * 60)
    print("All tests passed! ✓")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
