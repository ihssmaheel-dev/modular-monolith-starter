import json
import time
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import create_auth_headers


@pytest.mark.asyncio
async def test_hmac_valid_signature_accepted(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/chat/unary", body)

    with patch("api.unary.execute_chat_completion", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {
            "choices": [{"message": {"content": "ok"}}],
            "model": "test",
            "usage": {},
        }
        response = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
        assert response.status_code == 200
        assert response.json()["content"] == "ok"


@pytest.mark.asyncio
async def test_hmac_missing_headers_rejected(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")

    # Missing both headers
    response = await async_client.post("/api/v1/chat/unary", content=body)
    assert response.status_code == 401
    assert "Missing required authentication headers" in response.json()["detail"]

    # Missing signature
    response = await async_client.post(
        "/api/v1/chat/unary",
        content=body,
        headers={"x-timestamp": str(time.time()), "content-type": "application/json"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_hmac_expired_timestamp_rejected(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    expired_ts = time.time() - 3600  # 1 hour ago
    headers = create_auth_headers("POST", "/api/v1/chat/unary", body, timestamp=expired_ts)

    response = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_hmac_future_timestamp_rejected(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    future_ts = time.time() + 400  # > 300s in future
    headers = create_auth_headers("POST", "/api/v1/chat/unary", body, timestamp=future_ts)

    response = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_hmac_tampered_payload_rejected(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/chat/unary", body)

    tampered_body = json.dumps({"messages": [{"role": "user", "content": "tampered"}]}).encode(
        "utf-8"
    )
    response = await async_client.post("/api/v1/chat/unary", content=tampered_body, headers=headers)
    assert response.status_code == 401
    assert "Invalid X-Service-Signature" in response.json()["detail"]


@pytest.mark.asyncio
async def test_hmac_wrong_secret_rejected(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/chat/unary", body, secret="wrong-secret-key")

    response = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
    assert response.status_code == 401
    assert "Invalid X-Service-Signature" in response.json()["detail"]


@pytest.mark.asyncio
async def test_hmac_malformed_timestamp_rejected(async_client: AsyncClient):
    response = await async_client.post(
        "/api/v1/chat/unary",
        content=b"{}",
        headers={
            "x-timestamp": "not-a-number",
            "x-service-signature": "some-sig",
            "x-request-id": "req-test-malformed",
        },
    )
    assert response.status_code == 400
    assert "Invalid X-Timestamp header format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_hmac_tampered_tenant_header_rejected(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    headers = create_auth_headers(
        "POST",
        "/api/v1/chat/unary",
        body,
        tenant_id="tenant-original",
        request_id="req-tamper-1",
    )

    # Tamper with tenant header
    headers["x-tenant-id"] = "tenant-tampered"
    response = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
    assert response.status_code == 401
    assert "Invalid X-Service-Signature" in response.json()["detail"]


@pytest.mark.asyncio
async def test_hmac_replay_request_rejected(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    headers = create_auth_headers(
        "POST",
        "/api/v1/chat/unary",
        body,
        tenant_id="tenant-123",
        request_id="req-replay-unique-999",
    )

    with patch("api.unary.execute_chat_completion", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {
            "choices": [{"message": {"content": "ok"}}],
            "model": "test",
            "usage": {},
        }
        # First request succeeds
        res1 = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
        assert res1.status_code == 200

        # Immediate replay of identical request_id within window is rejected
        res2 = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
        assert res2.status_code == 401
        assert "Replay detected" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_hmac_missing_request_id_rejected(async_client: AsyncClient):
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/chat/unary", body)
    del headers["x-request-id"]

    response = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
    assert response.status_code == 401
    assert "Missing required authentication header: X-Request-Id" in response.json()["detail"]


@pytest.mark.asyncio
async def test_hmac_invalid_signature_does_not_poison_replay(async_client: AsyncClient):
    """Verify that an invalid signature is rejected BEFORE touching the replay cache."""
    body = json.dumps({"messages": [{"role": "user", "content": "hello"}]}).encode("utf-8")
    target_req_id = "req-poison-target-123"

    # Step 1: Attacker sends request with invalid signature and target_req_id
    bad_headers = {
        "x-timestamp": str(time.time()),
        "x-service-signature": "invalid-attacker-signature",
        "x-request-id": target_req_id,
        "content-type": "application/json",
    }
    attack_res = await async_client.post("/api/v1/chat/unary", content=body, headers=bad_headers)
    assert attack_res.status_code == 401
    assert "Invalid X-Service-Signature" in attack_res.json()["detail"]

    # Step 2: Legitimate request with valid signature and target_req_id should succeed (not poisoned)
    valid_headers = create_auth_headers(
        "POST",
        "/api/v1/chat/unary",
        body,
        request_id=target_req_id,
    )
    with patch("api.unary.execute_chat_completion", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {
            "choices": [{"message": {"content": "ok"}}],
            "model": "test",
            "usage": {},
        }
        legit_res = await async_client.post(
            "/api/v1/chat/unary", content=body, headers=valid_headers
        )
        assert legit_res.status_code == 200
        assert legit_res.json()["content"] == "ok"
