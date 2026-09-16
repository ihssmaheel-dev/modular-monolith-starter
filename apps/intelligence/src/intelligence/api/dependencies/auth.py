import hmac

from fastapi import Header, HTTPException, status

from intelligence.config.settings import Settings


def require_internal_service(
    settings: Settings,
    authorization: str | None = Header(default=None),
    x_service_audience: str | None = Header(default=None),
) -> None:
    expected = f"Bearer {settings.service_token}"
    if not settings.enabled or not settings.service_token or not authorization:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="SERVICE_DISABLED"
        )
    if not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")
    if not x_service_audience or not hmac.compare_digest(
        x_service_audience, settings.service_audience
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="INVALID_AUDIENCE")


def require_metrics_token(settings: Settings, authorization: str | None) -> None:
    expected = f"Bearer {settings.service_token}"
    if not settings.enabled or not settings.service_token or not authorization:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="SERVICE_DISABLED"
        )
    if not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="UNAUTHORIZED")
