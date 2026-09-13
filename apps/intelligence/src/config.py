from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = Field(default=8000, alias="PORT")
    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    internal_secret: str = Field(
        default="development-internal-ai-secret",
        alias="INTELLIGENCE_INTERNAL_SECRET",
    )

    # Provider Configuration
    ai_provider: str = Field(default="mock", alias="AI_PROVIDER")  # "mock" | "openai" | "ollama"
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_base_url: str = Field(default="https://api.openai.com/v1", alias="OPENAI_BASE_URL")
    default_model: str = Field(default="gpt-4o-mini", alias="DEFAULT_MODEL")


settings = Settings()
