from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environment
    ENVIRONMENT: str = Field(default="development", description="Runtime environment")

    # Server configuration
    INTELLIGENCE_PORT: int = Field(
        default=5157, description="Listening port for intelligence service"
    )
    INTELLIGENCE_HOST: str = Field(default="0.0.0.0", description="Listening host")
    INTELLIGENCE_SHARED_SECRET: str = Field(
        default="local-intelligence-shared-secret-key-32charsmin",
        min_length=32,
        description="Shared HMAC secret for API gateway authentication",
    )

    # Database configuration
    DATABASE_URL: str = Field(
        default="postgres://postgres:postgres@127.0.0.1:5432/app",
        description="PostgreSQL direct connection string",
    )
    DB_POOL_MIN: int = Field(default=2, ge=1)
    DB_POOL_MAX: int = Field(default=10, ge=1)

    # Redis configuration
    REDIS_URL: str = Field(
        default="redis://127.0.0.1:6379",
        description="Redis connection string for replay guard and pub/sub",
    )

    # Provider & model configuration
    DEFAULT_CHAT_MODEL: str = Field(default="gpt-4o-mini")
    DEFAULT_EMBEDDING_MODEL: str = Field(default="BAAI/bge-small-en-v1.5")
    EMBEDDING_MODEL_VERSION: str = Field(default="bge-small-en-v1.5")
    VECTOR_DIMENSION: int = Field(default=384, description="Target vector dimension")

    # Dynamic model allowlist (comma-separated, enables zero-redeploy rotation)
    INTELLIGENCE_ALLOWED_MODELS: str = Field(
        default="gpt-4o-mini,claude-3-5-sonnet-20240620,text-embedding-3-small,deepseek-chat",
        description="Comma-separated list of permitted LLM models",
    )

    # Search & RRF scoring configuration
    RRF_K: int = Field(default=60, description="RRF smoothing constant")
    RRF_CANDIDATE_LIMIT: int = Field(
        default=50, ge=1, le=500, description="Max candidates per dense/sparse RRF leg"
    )
    DENSE_WEIGHT: float = Field(default=0.5, description="Dense vector search score weight")
    SPARSE_WEIGHT: float = Field(default=0.5, description="Sparse keyword search score weight")

    # Guardrails, Timeouts & Defense settings
    EGRESS_TIMEOUT_SECONDS: float = Field(default=10.0, ge=1.0, le=60.0)
    DB_COMMAND_TIMEOUT_SECONDS: float = Field(default=10.0, ge=1.0, le=60.0)
    REDIS_SOCKET_TIMEOUT_SECONDS: float = Field(default=2.0, ge=0.1, le=30.0)
    REDIS_AUTH_HOTPATH_TIMEOUT_SECONDS: float = Field(default=0.5, ge=0.05, le=5.0)
    MAX_TIMESTAMP_DRIFT_SECONDS: int = Field(default=300, ge=10, le=3600)
    DEFAULT_RETRY_AFTER_MS: int = Field(default=1000, ge=100)
    MAX_RESPONSE_BYTES: int = Field(
        default=1_048_576, description="1MB maximum response payload cap"
    )
    MAX_EMBEDDING_PAYLOAD_BYTES: int = Field(
        default=1_048_576, description="1MB maximum embedding payload size"
    )
    MAX_UNARY_PAYLOAD_BYTES: int = Field(
        default=65_536, description="64KB maximum unary chat payload size"
    )
    ZERO_RETENTION_ENABLED: bool = Field(
        default=True, description="Enforce zero-retention headers upstream"
    )
    PII_REDACTION_ENABLED: bool = Field(
        default=True, description="Sanitize PII patterns before embedding/LLM"
    )

    # Token estimation & fallback cost rates (USD per token)
    CHARS_PER_TOKEN_ESTIMATE: int = Field(default=4, ge=1)
    EMBEDDING_COST_PER_TOKEN_USD: float = Field(default=0.00000002)
    CHAT_PROMPT_COST_PER_TOKEN_USD: float = Field(default=0.00000015)
    CHAT_COMPLETION_COST_PER_TOKEN_USD: float = Field(default=0.00000060)

    # Allowed egress provider hostnames
    EGRESS_ALLOWLIST: list[str] = Field(
        default_factory=lambda: [
            "api.openai.com",
            "api.anthropic.com",
            "api.groq.com",
            "api.mistral.ai",
            "api.deepseek.com",
            "generativelanguage.googleapis.com",
        ]
    )

    @property
    def allowed_models(self) -> set[str]:
        """Parsed set of permitted model identifiers."""
        return {m.strip() for m in self.INTELLIGENCE_ALLOWED_MODELS.split(",") if m.strip()}

    @model_validator(mode="after")
    def validate_production_secret(self) -> "Settings":
        """Disallow default dev secret in production and staging environments."""
        if self.ENVIRONMENT in ("production", "staging"):
            if (
                self.INTELLIGENCE_SHARED_SECRET == "local-intelligence-shared-secret-key-32charsmin"
                or len(self.INTELLIGENCE_SHARED_SECRET) < 32
            ):
                raise ValueError(
                    "INTELLIGENCE_SHARED_SECRET must be set to a secure, non-default string (>= 32 chars) in production and staging"
                )
        return self


settings = Settings()
