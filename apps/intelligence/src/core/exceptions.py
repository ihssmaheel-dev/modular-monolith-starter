class IntelligenceError(Exception):
    """Base domain exception for the intelligence service."""

    def __init__(self, message: str, code: str = "INTELLIGENCE_ERROR", status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class ProviderUnavailableError(IntelligenceError):
    def __init__(self, provider: str, reason: str = "Provider offline"):
        super().__init__(
            message=f"AI provider '{provider}' unavailable: {reason}",
            code="PROVIDER_UNAVAILABLE",
            status_code=503,
        )


class ModelNotFoundError(IntelligenceError):
    def __init__(self, model: str):
        super().__init__(
            message=f"Requested model '{model}' not supported",
            code="MODEL_NOT_FOUND",
            status_code=404,
        )


class ContextWindowExceededError(IntelligenceError):
    def __init__(self, tokens: int, max_tokens: int):
        super().__init__(
            message=f"Input length {tokens} exceeds model maximum {max_tokens}",
            code="CONTEXT_EXCEEDED",
            status_code=400,
        )
