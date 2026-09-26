import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from config import Settings
from errors import format_error_ref
from tests.conftest import create_auth_headers


def assert_canonical_envelope(data: dict, expected_status: int, expected_code: str) -> None:
    """Assert response JSON strictly adheres to @repo/contracts ApiErrorEnvelopeSchema."""
    assert data["status"] == expected_status
    assert data["code"] == expected_code
    assert isinstance(data["i18nKey"], str) and len(data["i18nKey"]) > 0
    assert isinstance(data["message"], str) and len(data["message"]) > 0
    assert isinstance(data["requestId"], str) and len(data["requestId"]) > 0
    assert isinstance(data["errorRef"], str) and len(data["errorRef"]) == 8
    assert isinstance(data["fieldErrors"], dict)
    assert isinstance(data["retry"], dict) and "retryable" in data["retry"]
    # Ensure non-canonical snake_case fields are absent
    assert "detail" not in data
    assert "i18n_key" not in data
    assert "request_id" not in data


@pytest.mark.asyncio
async def test_payload_too_large_413_and_trace_id_envelope(async_client: AsyncClient):
    """Verify 413 rejection for oversized unary payloads and traceId / errorRef derivation."""
    oversized = b"x" * 70_000  # > 65,536 MAX_UNARY_PAYLOAD_BYTES
    headers = create_auth_headers("POST", "/api/v1/chat/unary", oversized)
    headers["x-trace-id"] = "4bf92f3577b34da6a3ce929d0e0e4736"

    response = await async_client.post("/api/v1/chat/unary", content=oversized, headers=headers)
    assert response.status_code == 413
    data = response.json()
    assert_canonical_envelope(data, 413, "AI_PAYLOAD_TOO_LARGE")
    assert data["traceId"] == "4bf92f3577b34da6a3ce929d0e0e4736"
    assert data["errorRef"] == "4bf92f35"


def test_format_error_ref_parity_with_contracts():
    """Verify format_error_ref matches @repo/contracts formatErrorRef behavior."""
    assert format_error_ref("4bf92f3577b34da6", "req-123") == "4bf92f35"
    assert format_error_ref(None, "c018a12b-28b5-45d6-8634-5b47083095d5") == "c018a12b"
    assert format_error_ref(None, "req-12345678") == "req12345"
    assert format_error_ref(None, "abc") == "abc00000"
    assert format_error_ref(None, "") == "00000000"


def test_production_secret_validation_guard():
    """Verify Settings rejects default or short shared secret in production and staging."""
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            INTELLIGENCE_SHARED_SECRET="local-intelligence-shared-secret-key-32charsmin",
        )
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="staging",
            INTELLIGENCE_SHARED_SECRET="short-secret",
        )
