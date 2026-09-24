import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

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
        return "VALIDATION_ERROR", "intelligence.errors.invalidModel"
    if status_code == status.HTTP_504_GATEWAY_TIMEOUT:
        return "AI_REQUEST_TIMEOUT", "intelligence.errors.timeout"
    return "AI_SERVICE_UNAVAILABLE", "intelligence.errors.unavailable"


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
    """Enforces request payload size limits: 1MB for embeddings, 64KB for unary chat."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            length = int(content_length)
            path = request.url.path
            if (
                path.startswith("/api/v1/embeddings")
                and length > settings.MAX_EMBEDDING_PAYLOAD_BYTES
            ):
                return JSONResponse(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    content={
                        "code": "AI_PAYLOAD_TOO_LARGE",
                        "i18n_key": "intelligence.errors.payloadTooLarge",
                        "message": "Embedding payload exceeds 1MB limit",
                        "status": 413,
                        "request_id": request.headers.get("x-request-id"),
                    },
                )
            if path.startswith("/api/v1/chat") and length > settings.MAX_UNARY_PAYLOAD_BYTES:
                return JSONResponse(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    content={
                        "code": "AI_PAYLOAD_TOO_LARGE",
                        "i18n_key": "intelligence.errors.payloadTooLarge",
                        "message": "Chat payload exceeds 64KB limit",
                        "status": 413,
                        "request_id": request.headers.get("x-request-id"),
                    },
                )
        except ValueError:
            pass
    return await call_next(request)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Global handler formatting HTTPExceptions into standard error envelopes."""
    code, i18n_key = _map_status_to_code(exc.status_code, str(exc.detail))
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": code,
            "i18n_key": i18n_key,
            "message": str(exc.detail),
            "detail": str(exc.detail),
            "status": exc.status_code,
            "request_id": request.headers.get("x-request-id"),
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Global handler formatting validation errors into standard error envelopes."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "code": "VALIDATION_ERROR",
            "i18n_key": "intelligence.errors.invalidModel",
            "message": "Request validation failed",
            "status": 400,
            "request_id": request.headers.get("x-request-id"),
            "details": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Global fallback handler preventing raw stack trace or server information leaks."""
    logger.exception(f"Unhandled error processing request {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "code": "INTERNAL_SERVER_ERROR",
            "i18n_key": "intelligence.errors.unavailable",
            "message": "An unexpected error occurred in the intelligence service",
            "status": 500,
            "request_id": request.headers.get("x-request-id"),
        },
    )


# Register routes
app.include_router(health_router)
app.include_router(unary_router)
app.include_router(embeddings_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "intelligence", "status": "running"}
