import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from intelligence.domain.errors.errors import (
    BudgetExceededError,
    CircuitOpenError,
    IntelligenceError,
    InvalidProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    UnsafeStorageUrlError,
)

logger = logging.getLogger(__name__)


def error_status(error: IntelligenceError) -> int:
    if isinstance(error, BudgetExceededError):
        return 413
    if isinstance(error, UnsafeStorageUrlError):
        return 400
    if isinstance(error, (ProviderTimeoutError, ProviderUnavailableError, CircuitOpenError)):
        return 503
    if isinstance(error, InvalidProviderResponseError):
        return 502
    return 500


async def intelligence_error_handler(_request: Request, error: IntelligenceError) -> JSONResponse:
    logger.warning("intelligence request failed code=%s", error.code)
    return JSONResponse(status_code=error_status(error), content={"code": error.code})


async def unexpected_error_handler(_request: Request, error: Exception) -> JSONResponse:
    logger.exception("unhandled intelligence error")
    return JSONResponse(status_code=500, content={"code": "INTELLIGENCE_ERROR"})
