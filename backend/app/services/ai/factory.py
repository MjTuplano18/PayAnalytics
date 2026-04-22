"""Factory for creating AI API clients based on configuration."""

from app.core.config import settings
from app.services.ai.base_client import AIAPIClient
from app.services.ai.groq_client import GroqClient


def create_ai_client() -> AIAPIClient:
    """
    Create an AI API client based on configuration.
    
    Returns:
        AIAPIClient instance configured for the selected provider
        
    Raises:
        ValueError: If AI_PROVIDER is not supported or API key is missing
    """
    provider = settings.AI_PROVIDER.lower()
    
    if provider == "groq":
        if not settings.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY must be set in environment")
        
        return GroqClient(
            api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
            timeout=30,
            max_retries=2,
        )
    
    elif provider == "openai":
        # Placeholder for future OpenAI implementation
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY must be set in environment")
        
        raise NotImplementedError("OpenAI client not yet implemented. Use 'groq' provider.")
    
    elif provider == "anthropic":
        # Placeholder for future Anthropic implementation
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY must be set in environment")
        
        raise NotImplementedError("Anthropic client not yet implemented. Use 'groq' provider.")
    
    else:
        raise ValueError(
            f"Unsupported AI provider: {provider}. "
            f"Supported providers: groq, openai, anthropic"
        )


# Singleton instance for dependency injection
_ai_client: AIAPIClient | None = None


def get_ai_client() -> AIAPIClient:
    """
    Get or create the AI client singleton.
    
    This function is used for dependency injection in FastAPI endpoints.
    
    Returns:
        AIAPIClient instance
    """
    global _ai_client
    
    if _ai_client is None:
        _ai_client = create_ai_client()
    
    return _ai_client
