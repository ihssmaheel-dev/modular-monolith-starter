import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.embeddings import router as embeddings_router
from api.health import router as health_router
from api.unary import router as unary_router
from config import settings
from database.connection import close_pool, init_pool
from database.migrations import run_migrations
from engines.embedding_engine import get_embedding_model
from errors import format_error_ref, register_exception_handlers
from middleware.payload_limit import payload_size_limit_middleware
from security.replay import close_redis_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("intelligence.main")


async def warmup_embedding_model() -> None:
    """Warm up local embedding model and assert target dimensions."""
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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context managing database pool, Redis, and model warm-up."""
    logger.info("Starting up Intelligence Service...")
    try:
        await init_pool()
        await run_migrations()
    except Exception as exc:
        logger.warning(f"Database connection or migration deferred: {exc}")

    await warmup_embedding_model()

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

# Register middleware
app.middleware("http")(payload_size_limit_middleware)

# Register canonical exception handlers
register_exception_handlers(app)

# Register routes
app.include_router(health_router)
app.include_router(unary_router)
app.include_router(embeddings_router)

__all__ = ["app", "format_error_ref"]
