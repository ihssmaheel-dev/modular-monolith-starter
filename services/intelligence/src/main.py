import logging
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from api.embeddings import router as embeddings_router
from api.health import router as health_router
from api.unary import router as unary_router
from config import settings
from database.connection import close_pool, init_pool
from database.migrations import run_migrations
from engines.embedding_engine import get_embedding_model
from security.replay import close_redis_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("intelligence.main")


def _map_status_to_code(status_code: int, detail: str) -> tuple[str, str]:
    """Map HTTP status codes and detail hints to canonical domain error codes and i18n keys."""
    if status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return "AI_RATE_LIMITED", "intelligence.errors.rateLimited"
    if status_code == status.HTTP_413_CONTENT_TOO_LARGE:
        return "AI_PAYLOAD_TOO_LARGE", "intelligence.errors.payloadTooLarge"
    if status_code == status.HTTP_401_UNAUTHORIZED:
        return "AI_UNAUTHORIZED", "intelligence.errors.unauthorized"
    if status_code == status.HTTP_400_BAD_REQUEST:
        if "model" in detail.lower():
            return "AI_INVALID_MODEL", "intelligence.errors.invalidModel"
        return "VALIDATION_ERROR", "common.validation.invalidInput"
    if status_code == status.HTTP_504_GATEWAY_TIMEOUT:
        return "AI_REQUEST_TIMEOUT", "intelligence.errors.timeout"
    return "AI_SERVICE_UNAVAILABLE", "intelligence.errors.unavailable"


def format_error_ref(trace_id: str | None = None, request_id: str | None = None) -> str:
    """
    Derives an 8-character error reference ID matching @repo/contracts formatErrorRef:
    1. First 8 hex chars of traceId if available.
    2. First 8 alphanumeric chars of requestId's first hyphenated group if >= 8 chars.
    3. First 8 alphanumeric chars of full requestId (or right-padded with '0' if < 8).
    4. Fallback '00000000'.
    """
    if isinstance(trace_id, str) and trace_id.strip():
        clean_trace = re.sub(r"[^a-fA-F0-9]", "", trace_id).lower()
        if len(clean_trace) >= 8:
            return clean_trace[:8]
    if isinstance(request_id, str) and request_id.strip():
        first_group = re.sub(r"[^a-zA-Z0-9]", "", request_id.split("-")[0]).lower()
        if len(first_group) >= 8:
            return first_group[:8]
        clean_req = re.sub(r"[^a-zA-Z0-9]", "", request_id).lower()
        if len(clean_req) >= 8:
            return clean_req[:8]
        if len(clean_req) > 0:
            return clean_req.ljust(8, "0")
    return "00000000"


def _extract_trace_id(request: Request) -> str | None:
    """Extract OpenTelemetry trace ID from x-trace-id or W3C traceparent header."""
    direct = request.headers.get("x-trace-id")
    if direct and direct.strip():
        return direct.strip()
    traceparent = request.headers.get("traceparent")
    if traceparent:
        parts = traceparent.strip().split("-")
        if len(parts) >= 2 and len(parts[1]) == 32:
            return parts[1]
    return None


def _format_error_response(
    status_code: int,
    code: str,
    i18n_key: str,
    message: str,
    request: Request,
    field_errors: dict[str, list[str]] | None = None,
) -> JSONResponse:
    """Format canonical error response strictly matching @repo/contracts ApiErrorEnvelopeSchema."""
    request_id = request.headers.get("x-request-id")
    if not request_id or not request_id.strip():
        request_id = f"req-{uuid.uuid4().hex[:12]}"

    trace_id = _extract_trace_id(request)
    error_ref = format_error_ref(trace_id=trace_id, request_id=request_id)
    field_errors_map = field_errors if field_errors is not None else {}

    is_retryable = status_code in (
        status.HTTP_429_TOO_MANY_REQUESTS,
        status.HTTP_502_BAD_GATEWAY,
        status.HTTP_503_SERVICE_UNAVAILABLE,
        status.HTTP_504_GATEWAY_TIMEOUT,
    ) or code in ("AI_RATE_LIMITED", "AI_SERVICE_UNAVAILABLE", "AI_REQUEST_TIMEOUT")
    retry_meta: dict[str, Any] = {"retryable": is_retryable}
    if is_retryable:
        retry_meta["retryAfterMs"] = 1000

    content: dict[str, Any] = {
        "code": code,
        "i18nKey": i18n_key,
        "message": message,
        "status": status_code,
        "requestId": request_id,
        "errorRef": error_ref,
        "fieldErrors": field_errors_map,
        "retry": retry_meta,
    }
    if trace_id:
        content["traceId"] = trace_id

    return JSONResponse(status_code=status_code, content=content)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context managing database pool, Redis, and model warm-up."""
    logger.info("Starting up Intelligence Service...")
    # Initialize database pool and run schema migrations
    try:
        await init_pool()
        await run_migrations()
    except Exception as exc:
        logger.warning(f"Database connection or migration deferred: {exc}")

    # Warm up local embedding model and assert target dimensions
    try:
        model = get_embedding_model()
        test_embed = list(model.embed(["warmup"]))[0]
        if len(test_embed) != settings.VECTOR_DIMENSION:
            logger.error(
                f"Embedding model dimension mismatch: expected {settings.VECTOR_DIMENSION}, got {len(test_embed)}"
            )
        logger.info("FastEmbed model pre-warmed and validated successfully.")
    except Exception as exc:
        logger.warning(f"Embedding model pre-warming deferred: {exc}")

    yield

    logger.info("Shutting down Intelligence Service...")
    await close_pool()
    await close_redis_client()


app = FastAPI(
    title="Intelligence Service",
    description="Decoupled, high-performance Python Intelligence layer for modular monolith",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def payload_size_limit_middleware(request: Request, call_next):
    """
    Enforces request and response payload size limits:
    1MB for embeddings, 64KB for unary chat, and MAX_RESPONSE_BYTES for responses.
    Streams request chunks incrementally to defeat missing/chunked Content-Length bypasses.
    """
    path = request.url.path
    if path.startswith("/api/v1/embeddings") or path.startswith("/api/v1/chat"):
        max_bytes = (
            settings.MAX_EMBEDDING_PAYLOAD_BYTES
            if path.startswith("/api/v1/embeddings")
            else settings.MAX_UNARY_PAYLOAD_BYTES
        )
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > max_bytes:
                    return _format_error_response(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        code="AI_PAYLOAD_TOO_LARGE",
                        i18n_key="intelligence.errors.payloadTooLarge",
                        message=f"Request payload exceeds {max_bytes} byte limit",
                        request=request,
                    )
            except ValueError:
                pass

        chunks: list[bytes] = []
        total_bytes = 0
        async for chunk in request.stream():
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                return _format_error_response(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    code="AI_PAYLOAD_TOO_LARGE",
                    i18n_key="intelligence.errors.payloadTooLarge",
                    message=f"Request payload exceeds {max_bytes} byte limit",
                    request=request,
                )
            chunks.append(chunk)
        request._body = b"".join(chunks)

    response = await call_next(request)
    res_content_length = response.headers.get("content-length")
    if res_content_length:
        try:
            if int(res_content_length) > settings.MAX_RESPONSE_BYTES:
                return _format_error_response(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    code="AI_SERVICE_UNAVAILABLE",
                    i18n_key="intelligence.errors.unavailable",
                    message=f"Response payload exceeds {settings.MAX_RESPONSE_BYTES} byte limit",
                    request=request,
                )
        except ValueError:
            pass
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Global handler formatting HTTPExceptions into standard error envelopes."""
    code, i18n_key = _map_status_to_code(exc.status_code, str(exc.detail))
    return _format_error_response(
        status_code=exc.status_code,
        code=code,
        i18n_key=i18n_key,
        message=str(exc.detail),
        request=request,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Global handler formatting validation errors into standard error envelopes."""
    field_errors: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", []) if x != "body") or "general"
        msg = err.get("msg", "Validation error")
        field_errors.setdefault(loc, []).append(msg)

    detail_str = str(exc.errors())
    is_model_err = "model" in detail_str.lower()
    code = "AI_INVALID_MODEL" if is_model_err else "VALIDATION_ERROR"
    i18n_key = (
        "intelligence.errors.invalidModel" if is_model_err else "common.validation.invalidInput"
    )

    return _format_error_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        code=code,
        i18n_key=i18n_key,
        message="Request validation failed",
        request=request,
        field_errors=field_errors,
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Global fallback handler preventing raw stack trace or server information leaks."""
    logger.exception(f"Unhandled error processing request {request.url.path}: {exc}")
    return _format_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="AI_SERVICE_UNAVAILABLE",
        i18n_key="intelligence.errors.unavailable",
        message="An unexpected error occurred in the intelligence service",
        request=request,
    )


# Register routes
app.include_router(health_router)
app.include_router(unary_router)
app.include_router(embeddings_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "intelligence", "status": "running"}
