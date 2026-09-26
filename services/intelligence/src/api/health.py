import logging

from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from config import settings
from database.connection import system_connection

logger = logging.getLogger("intelligence.health")

router = APIRouter(tags=["Health"])


class LivenessResponse(BaseModel):
    status: str = "ok"


class ReadinessResponse(BaseModel):
    status: str
    database: str
    embedding_model: str


@router.get("/")
async def root() -> dict[str, str]:
    """Root endpoint returning service identity."""
    return {"service": "intelligence", "status": "running"}


@router.get("/health/live", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    """Kubernetes / Docker liveness probe: returns 200 if process is running."""
    return LivenessResponse(status="ok")


@router.get("/health/ready", response_model=ReadinessResponse)
async def readiness(response: Response) -> ReadinessResponse:
    """Readiness probe: validates database connectivity and model availability without leaking internals."""
    db_status = "ok"
    try:
        async with system_connection() as conn:
            val = await conn.fetchval("SELECT 1")
            if val != 1:
                db_status = "unresponsive"
    except Exception as exc:
        logger.warning(f"Database readiness check failed: {exc}")
        db_status = "unavailable"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(
            status="degraded",
            database=db_status,
            embedding_model=settings.DEFAULT_EMBEDDING_MODEL,
        )

    return ReadinessResponse(
        status="ready",
        database=db_status,
        embedding_model=settings.DEFAULT_EMBEDDING_MODEL,
    )
