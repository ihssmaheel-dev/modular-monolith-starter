import hashlib
import hmac
import os
import time
import uuid
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
    request_id: str | None = None,
) -> dict[str, str]:
    """Helper to generate HMAC authentication headers for test requests."""
    req_id = request_id if request_id is not None else f"req-test-{uuid.uuid4().hex[:12]}"
    ts = str(timestamp if timestamp is not None else time.time())
    body_hash = hashlib.sha256(body).hexdigest()
    canonical_payload = f"{method.upper()}:{path}:{ts}:{user_id}:{tenant_id}:{req_id}:{body_hash}"
    sig = hmac.new(
        secret.encode("utf-8"),
        canonical_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    headers = {
        "x-timestamp": ts,
        "x-service-signature": sig,
        "x-request-id": req_id,
        "content-type": "application/json",
    }
    if user_id:
        headers["x-user-id"] = user_id
    if tenant_id:
        headers["x-tenant-id"] = tenant_id
    return headers


@pytest.fixture(autouse=True)
def reset_replay_cache():
    """Ensure in-memory replay cache is clean across test executions."""
    from security.replay import _local_replay_cache

    _local_replay_cache.clear()


class _FakeEmbeddingVector(list[float]):
    """List subclass providing .tolist() parity with numpy ndarray for FastEmbed mock."""

    def tolist(self) -> list[float]:
        return list(self)


class _HermeticEmbeddingModel:
    """Deterministic, zero-network 384-dimensional L2-normalized embedding model for tests."""

    def embed(self, texts: list[str]) -> list[_FakeEmbeddingVector]:
        results: list[_FakeEmbeddingVector] = []
        dim = 384
        val = 1.0 / (dim**0.5)
        for _ in texts:
            results.append(_FakeEmbeddingVector([val] * dim))
        return results


@pytest.fixture(autouse=True)
def hermetic_environment(monkeypatch: pytest.MonkeyPatch):
    """
    Ensure unit tests never download models from HuggingFace or open live TCP connections
    to localhost Postgres/Redis unless explicitly overridden by a test.
    """
    from unittest.mock import AsyncMock

    import api.embeddings
    import api.unary
    import engines.embedding_engine

    monkeypatch.setattr(
        engines.embedding_engine,
        "get_embedding_model",
        lambda: _HermeticEmbeddingModel(),
    )

    mock_conn = AsyncMock()
    mock_conn.execute.return_value = None
    mock_conn.fetch.return_value = []
    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    monkeypatch.setattr(api.unary, "tenant_connection", lambda _tid=None: mock_cm)
    monkeypatch.setattr(api.embeddings, "tenant_connection", lambda _tid=None: mock_cm)


@pytest.fixture
async def async_client() -> AsyncIterator[AsyncClient]:
    """Yield an async test client configured with ASGI transport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
