import hashlib
import hmac


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
