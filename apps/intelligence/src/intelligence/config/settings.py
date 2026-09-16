from functools import lru_cache
from typing import Annotated, cast

from pydantic import Field, HttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated service configuration. Disabled is the safe default."""

    model_config = SettingsConfigDict(
        env_prefix="INTELLIGENCE_",
        case_sensitive=False,
        extra="ignore",
    )

    enabled: bool = False
    service_token: str = ""
    service_audience: str = "modular-monolith-intelligence"
    provider: str = "openai-compatible"
    provider_base_url: HttpUrl | None = None
    provider_api_key: str = ""
    model: str = ""
    embedding_model: str = ""
    request_timeout_seconds: Annotated[float, Field(gt=0, le=120)] = 30.0
    max_concurrency: Annotated[int, Field(gt=0, le=128)] = 4
    max_request_bytes: Annotated[int, Field(gt=0, le=10_000_000)] = 1_000_000
    max_document_bytes: Annotated[int, Field(gt=0, le=50_000_000)] = 10_000_000
    max_context_items: Annotated[int, Field(gt=0, le=100)] = 20
    max_chunks: Annotated[int, Field(gt=0, le=10_000)] = 2_000
    max_output_tokens: Annotated[int, Field(gt=0, le=16_384)] = 2_048
    max_input_tokens: Annotated[int, Field(gt=0, le=1_000_000)] = 32_000
    max_retries: Annotated[int, Field(ge=0, le=5)] = 2
    allowed_storage_hosts: tuple[str, ...] = ()
    otel_endpoint: HttpUrl | None = None
    metrics_enabled: bool = True
    log_level: str = "INFO"

    @field_validator("service_token", "provider_api_key", mode="before")
    @classmethod
    def normalize_secret(cls, value: object) -> str:
        return str(value or "").strip()

    @field_validator("allowed_storage_hosts", mode="before")
    @classmethod
    def parse_hosts(cls, value: object) -> tuple[str, ...]:
        if value is None or value == "":
            return ()
        if isinstance(value, str):
            return tuple(host.strip().lower() for host in value.split(",") if host.strip())
        if isinstance(value, (list, tuple, set)):
            values = cast(list[object] | tuple[object, ...] | set[object], value)
            return tuple(str(host).strip().lower() for host in values if str(host).strip())
        raise ValueError("INTELLIGENCE_ALLOWED_STORAGE_HOSTS must be a comma-separated list")

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("INTELLIGENCE_LOG_LEVEL must be a standard logging level")
        return normalized

    @model_validator(mode="after")
    def validate_enabled_configuration(self) -> "Settings":
        if not self.enabled:
            return self
        if len(self.service_token) < 32:
            raise ValueError(
                "INTELLIGENCE_SERVICE_TOKEN must be at least 32 characters when enabled"
            )
        if self.provider != "openai-compatible":
            raise ValueError("Only the openai-compatible provider is supported by the foundation")
        if self.provider_base_url is None or not self.provider_api_key:
            raise ValueError("Provider URL and key are required when intelligence is enabled")
        if not self.model or not self.embedding_model:
            raise ValueError("Model and embedding model are required when intelligence is enabled")
        if not self.allowed_storage_hosts:
            raise ValueError("INTELLIGENCE_ALLOWED_STORAGE_HOSTS is required when enabled")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
