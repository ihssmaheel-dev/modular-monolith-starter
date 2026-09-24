import hashlib
import hmac
import os
import time
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

# Set test environment variables before importing app
os.environ["INTELLIGENCE_SHARED_SECRET"] = "test-secret-key-32-chars-long-12345"
os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/test_db"
os.environ["OPENAI_API_KEY"] = "test-api-key"
os.environ["PII_REDACTION_ENABLED"] = "true"
os.environ["ENVIRONMENT"] = "development"

from config import settings
from main import app  # noqa: E402

TEST_SECRET = settings.INTELLIGENCE_SHARED_SECRET


def create_auth_headers(
    method: str,
    path: str,
    body: bytes,
    secret: str = TEST_SECRET,
    timestamp: float | None = None,
    user_id: str = "",
    tenant_id: str = "",
    request_id: str = "",
) -> dict[str, str]:
    """Helper to generate HMAC authentication headers for test requests."""
    ts = str(timestamp if timestamp is not None else time.time())
    body_hash = hashlib.sha256(body).hexdigest()
    canonical_payload = (
        f"{method.upper()}:{path}:{ts}:{user_id}:{tenant_id}:{request_id}:{body_hash}"
    )
    sig = hmac.new(
        secret.encode("utf-8"),
        canonical_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    headers = {
        "x-timestamp": ts,
        "x-service-signature": sig,
        "content-type": "application/json",
    }
    if user_id:
        headers["x-user-id"] = user_id
    if tenant_id:
        headers["x-tenant-id"] = tenant_id
    if request_id:
        headers["x-request-id"] = request_id
    return headers


@pytest.fixture
async def async_client() -> AsyncIterator[AsyncClient]:
    """Yield an async test client configured with ASGI transport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
