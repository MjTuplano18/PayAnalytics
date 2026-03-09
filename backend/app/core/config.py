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

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]


settings = Settings()  # type: ignore[call-arg]
