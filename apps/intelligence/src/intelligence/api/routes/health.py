from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from intelligence.api.dependencies.auth import require_metrics_token
from intelligence.config.settings import Settings
from intelligence.infrastructure.observability.metrics import metrics_response

router = APIRouter(tags=["health"])


@router.get("/internal/v1/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/internal/v1/health/ready")
async def ready(settings: Settings = Depends()) -> dict[str, str]:  # noqa: B008
    if not settings.enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="SERVICE_DISABLED"
        )
    return {"status": "ready"}


@router.get("/internal/v1/metrics")
async def metrics(
    settings: Settings = Depends(),  # noqa: B008
    authorization: str | None = Header(default=None),
) -> Response:
    require_metrics_token(settings, authorization)
    body, content_type = metrics_response()
    return Response(content=body, media_type=content_type)
