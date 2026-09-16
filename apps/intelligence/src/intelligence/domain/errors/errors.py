class IntelligenceError(Exception):
    """Base error that is safe to map to a stable internal error code."""

    code = "INTELLIGENCE_ERROR"


class ProviderUnavailableError(IntelligenceError):
    code = "PROVIDER_UNAVAILABLE"


class ProviderTimeoutError(IntelligenceError):
    code = "PROVIDER_TIMEOUT"


class BudgetExceededError(IntelligenceError):
    code = "BUDGET_EXCEEDED"


class CircuitOpenError(IntelligenceError):
    code = "PROVIDER_CIRCUIT_OPEN"


class InvalidProviderResponseError(IntelligenceError):
    code = "INVALID_PROVIDER_RESPONSE"


class UnsafeStorageUrlError(IntelligenceError):
    code = "UNSAFE_STORAGE_URL"
