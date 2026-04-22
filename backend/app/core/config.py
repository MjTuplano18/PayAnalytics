from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    APP_NAME: str = "PayAnalytics API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database (Neon PostgreSQL)
    DATABASE_URL: str  # e.g. postgresql+asyncpg://user:pass@ep-xxx.neon.tech/dbname?ssl=require

    # JWT Authentication
    SECRET_KEY: str  # Generate with: openssl rand -hex 32
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS — restrict allowed origins in production via environment variable
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]
    # Optional regex for dynamic origins, e.g. Vercel preview deployments
    ALLOWED_ORIGINS_REGEX: str = ""

    # Rate-limiting (login brute-force protection)
    # Max failed login attempts per IP before a temporary lockout is applied.
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: int = 10
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 60

    # AI Chat Assistant Configuration
    AI_PROVIDER: str = "openai"  # Options: 'openai', 'anthropic', or 'groq'
    OPENAI_API_KEY: str = ""  # OpenAI API key for GPT-4
    ANTHROPIC_API_KEY: str = ""  # Anthropic API key for Claude
    GROQ_API_KEY: str = ""  # Groq API key for Llama models
    AI_MAX_TOKENS: int = 2000  # Maximum tokens to generate per request
    AI_TEMPERATURE: float = 0.7  # Temperature for AI response generation (0.0-1.0)


settings = Settings()  # type: ignore[call-arg]
