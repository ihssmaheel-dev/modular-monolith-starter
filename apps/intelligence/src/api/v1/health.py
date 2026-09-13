import time
from fastapi import APIRouter
from pydantic import BaseModel
from src.config import settings

router = APIRouter(tags=["Health"])

START_TIME = time.time()


class HealthResponse(BaseModel):
    status: str
    service: str
    uptimeSeconds: float
    provider: str
    defaultModel: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="intelligence",
        uptimeSeconds=round(time.time() - START_TIME, 2),
        provider=settings.ai_provider,
        defaultModel=settings.default_model,
    )
