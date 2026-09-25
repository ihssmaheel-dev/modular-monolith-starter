import json
import math
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from engines.embedding_engine import embed_documents, embed_text
from tests.conftest import create_auth_headers


def test_embed_text_dimension_and_normalization():
    text = "Antigravity modular monolith architecture documentation."
    vector = embed_text(text)

    # FastEmbed BAAI/bge-small-en-v1.5 produces 384-dimensional vectors
    assert len(vector) == 384
    assert all(isinstance(x, float) for x in vector)

    # Vectors should be L2-normalized (magnitude ≈ 1.0)
    magnitude = math.sqrt(sum(x * x for x in vector))
    assert pytest.approx(magnitude, rel=1e-3) == 1.0


def test_embed_text_redacts_pii():
    with patch(
        "engines.embedding_engine.sanitize_pii", return_value="[REDACTED_EMAIL] note"
    ) as mock_pii:
        embed_text("secret user@example.com note")
        mock_pii.assert_called_once_with("secret user@example.com note")


def test_embed_documents_batch():
    texts = [
        "First document explaining tenancy isolation.",
        "Second document detailing outbox events.",
        "Third document covering database migrations.",
    ]
    vectors = embed_documents(texts)
    assert len(vectors) == 3
    for v in vectors:
        assert len(v) == 384


@pytest.mark.asyncio
async def test_create_embeddings_endpoint(async_client: AsyncClient):
    payload = {"texts": ["Hello world", "FastAPI intelligence layer"]}
    body = json.dumps(payload).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/embeddings/create", body)

    response = await async_client.post("/api/v1/embeddings/create", content=body, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["embeddings"]) == 2
    assert data["dimension"] == 384
    assert "model_version" in data


@pytest.mark.asyncio
async def test_index_document_endpoint(async_client: AsyncClient):
    payload = {
        "id": "doc-uuid-1",
        "tenant_id": "tenant-uuid-1",
        "source_type": "note",
        "source_id": "note-uuid-1",
        "content": "A high performance note about distributed systems.",
        "metadata": {"tags": ["architecture", "performance"]},
    }
    body = json.dumps(payload).encode("utf-8")
    headers = create_auth_headers(
        "POST",
        "/api/v1/embeddings/index",
        body,
        tenant_id="tenant-uuid-1",
        request_id="req-1",
    )

    mock_conn = AsyncMock()
    mock_conn.execute.return_value = None

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    with (
        patch("api.embeddings.tenant_connection", return_value=mock_cm),
        patch("api.embeddings.record_usage", new_callable=AsyncMock) as mock_usage,
    ):
        response = await async_client.post(
            "/api/v1/embeddings/index", content=body, headers=headers
        )
        assert response.status_code == 201
        assert response.json() == {"status": "indexed", "id": "doc-uuid-1"}
        mock_conn.execute.assert_called_once()
        mock_usage.assert_called_once()


@pytest.mark.asyncio
async def test_create_embeddings_dimension_mismatch_rejected(async_client: AsyncClient):
    """Verify /create rejects vectors whose dimension does not match settings.VECTOR_DIMENSION."""
    payload = {"texts": ["Hello world"]}
    body = json.dumps(payload).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/embeddings/create", body)

    with patch("api.embeddings.embed_documents", return_value=[[0.1, 0.2, 0.3]]):
        response = await async_client.post(
            "/api/v1/embeddings/create", content=body, headers=headers
        )
        assert response.status_code == 500
        data = response.json()
        assert data["code"] == "AI_SERVICE_UNAVAILABLE"
        assert "dimension mismatch" in data["message"].lower()


@pytest.mark.asyncio
async def test_create_embeddings_per_item_length_limit(async_client: AsyncClient):
    """Verify per-item string bound (max 10,000 chars) in texts[] array."""
    payload = {"texts": ["x" * 10_001]}
    body = json.dumps(payload).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/embeddings/create", body)

    response = await async_client.post("/api/v1/embeddings/create", content=body, headers=headers)
    assert response.status_code == 400
    data = response.json()
    assert data["code"] == "VALIDATION_ERROR"
    assert "fieldErrors" in data


@pytest.mark.asyncio
async def test_index_document_respects_pii_toggle_false(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    """Verify that when PII_REDACTION_ENABLED is False, neither content nor metadata is redacted."""
    from config import settings

    monkeypatch.setattr(settings, "PII_REDACTION_ENABLED", False)
    payload = {
        "id": "doc-uuid-raw",
        "tenant_id": "tenant-uuid-1",
        "source_type": "note",
        "source_id": "note-uuid-raw",
        "content": "Contact raw@example.com for details.",
        "metadata": {"owner": "raw@example.com"},
    }
    body = json.dumps(payload).encode("utf-8")
    headers = create_auth_headers(
        "POST", "/api/v1/embeddings/index", body, tenant_id="tenant-uuid-1"
    )

    mock_conn = AsyncMock()
    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    with patch("api.embeddings.tenant_connection", return_value=mock_cm):
        response = await async_client.post(
            "/api/v1/embeddings/index", content=body, headers=headers
        )
        assert response.status_code == 201
        # First conn.execute call is INSERT INTO intelligence.document_embeddings
        insert_args = mock_conn.execute.call_args_list[0].args
        stored_content = insert_args[6]
        stored_metadata = insert_args[8]
        assert "raw@example.com" in stored_content
        assert "raw@example.com" in stored_metadata
