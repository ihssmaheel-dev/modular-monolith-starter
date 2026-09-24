import hashlib
import hmac
import time
from typing import Annotated

from fastapi import Header, HTTPException, Request, status

from config import settings
from security.replay import check_and_record_request

MAX_TIMESTAMP_DRIFT_SECONDS = 300  # 5 minutes


def compute_signature(
    secret: str,
    method: str,
    path: str,
    timestamp: str,
    body: bytes,
    user_id: str = "",
    tenant_id: str = "",
    request_id: str = "",
) -> str:
    """
    Computes canonical HMAC-SHA256 digest of request components including
    user, tenant, and request identity headers.
    """
    body_hash = hashlib.sha256(body).hexdigest()
    canonical_payload = (
        f"{method.upper()}:{path}:{timestamp}:{user_id}:{tenant_id}:{request_id}:{body_hash}"
    )
    return hmac.new(
        secret.encode("utf-8"),
        canonical_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


async def verify_gateway_signature(
    request: Request,
    x_timestamp: Annotated[str | None, Header()] = None,
    x_service_signature: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
    x_tenant_id: Annotated[str | None, Header()] = None,
    x_request_id: Annotated[str | None, Header()] = None,
) -> None:
    """
    FastAPI security dependency validating that incoming requests originate
    exclusively from the NestJS API Gateway with a valid HMAC-SHA256 signature
    over all identity headers, non-expired timestamp, and replay protection.
    """
    if not x_timestamp or not x_service_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing required authentication headers: X-Timestamp or X-Service-Signature",
        )

    try:
        req_time = float(x_timestamp)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid X-Timestamp header format",
        ) from None

    current_time = time.time()
    if abs(current_time - req_time) > MAX_TIMESTAMP_DRIFT_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Timestamp is expired or outside allowable window",
        )

    # Replay protection check
    if x_request_id:
        is_fresh = await check_and_record_request(
            x_request_id, ttl_seconds=MAX_TIMESTAMP_DRIFT_SECONDS
        )
        if not is_fresh:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Replay detected: request ID already processed",
            )

    body = await request.body()
    expected_sig = compute_signature(
        secret=settings.INTELLIGENCE_SHARED_SECRET,
        method=request.method,
        path=request.url.path,
        timestamp=x_timestamp,
        body=body,
        user_id=x_user_id or "",
        tenant_id=x_tenant_id or "",
        request_id=x_request_id or "",
    )

    if not hmac.compare_digest(expected_sig, x_service_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid X-Service-Signature",
        )
