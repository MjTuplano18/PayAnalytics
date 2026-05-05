from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
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


settings = Settings()  # type: ignore[call-arg]
