from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
from src.config import settings

INTERNAL_TOKEN_HEADER = APIKeyHeader(name="X-Internal-Token", auto_error=False)


def verify_internal_token(token: str | None = Security(INTERNAL_TOKEN_HEADER)) -> str:
    """Guards endpoints ensuring only the trusted internal monolith gateway can call them."""
    if not token or token != settings.internal_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing internal gateway token",
        )
    return token
