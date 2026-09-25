import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from pydantic import BaseModel

from engines.instructor_client import extract_structured
from engines.litellm_client import execute_chat_completion
from tests.conftest import create_auth_headers


class _DummyExtraction(BaseModel):
    summary: str


@pytest.mark.asyncio
async def test_execute_chat_completion_zero_retention_and_pii():
    mock_response = MagicMock()
    mock_response.model_dump.return_value = {
        "choices": [{"message": {"content": "Processed response without secrets"}}],
        "model": "gpt-4o-mini",
        "usage": {"total_tokens": 20},
    }

    with patch(
        "litellm.acompletion", new_callable=AsyncMock, return_value=mock_response
    ) as mock_acompletion:
        messages = [
            {
                "role": "user",
                "content": "Contact me at secret@company.com with key sk-12345678901234567890",
            }
        ]
        res = await execute_chat_completion(messages=messages, model="gpt-4o-mini")

        assert res["choices"][0]["message"]["content"] == "Processed response without secrets"

        # Verify litellm call received sanitized messages and zero-retention headers
        mock_acompletion.assert_called_once()
        call_kwargs = mock_acompletion.call_args.kwargs
        called_messages = call_kwargs["messages"]
        assert "secret@company.com" not in called_messages[0]["content"]
        assert "[REDACTED_EMAIL]" in called_messages[0]["content"]
        assert call_kwargs["extra_headers"]["X-No-Training"] == "true"


@pytest.mark.asyncio
async def test_egress_allowlist_blocks_unauthorized_host():
    """Verify both execute_chat_completion and extract_structured enforce EGRESS_ALLOWLIST."""
    with pytest.raises(ValueError, match="not permitted by EGRESS_ALLOWLIST"):
        await execute_chat_completion(
            messages=[{"role": "user", "content": "hi"}],
            model="gpt-4o-mini",
            api_base="https://untrusted-exfiltration.example.com/v1",
        )

    with pytest.raises(ValueError, match="not permitted by EGRESS_ALLOWLIST"):
        await extract_structured(
            response_model=_DummyExtraction,
            text="sample",
            model="gpt-4o-mini",
            api_base="https://untrusted-exfiltration.example.com/v1",
        )


@pytest.mark.asyncio
async def test_model_allowlist_blocks_unapproved_model():
    """Verify unapproved models are rejected before any upstream call."""
    with pytest.raises(ValueError, match="not in allowed models list"):
        await execute_chat_completion(
            messages=[{"role": "user", "content": "hi"}],
            model="gpt-4-unapproved-model",
        )


@pytest.mark.asyncio
async def test_unary_chat_endpoint_success_and_usage_ledger(async_client: AsyncClient):
    payload = {
        "messages": [{"role": "user", "content": "Summarize key architectural invariants"}],
        "temperature": 0.1,
        "max_tokens": 500,
    }
    body = json.dumps(payload).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/chat/unary", body, tenant_id="tenant-1")

    mock_litellm_result = {
        "choices": [
            {"message": {"content": "1. Outbox invariant\n2. Zero retention\n3. Dedicated schema"}}
        ],
        "model": "gpt-4o-mini",
        "usage": {"prompt_tokens": 120, "completion_tokens": 250, "total_tokens": 370},
    }

    with (
        patch("api.unary.execute_chat_completion", new_callable=AsyncMock) as mock_exec,
        patch("api.unary.record_usage", new_callable=AsyncMock) as mock_usage,
    ):
        mock_exec.return_value = mock_litellm_result

        response = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "Outbox invariant" in data["content"]
        assert data["model"] == "gpt-4o-mini"
        assert data["usage"]["total_tokens"] == 370

        mock_usage.assert_called_once()
        usage_kwargs = mock_usage.call_args.kwargs
        assert usage_kwargs["tenant_id"] == "tenant-1"
        assert usage_kwargs["total_tokens"] == 370
        assert usage_kwargs["cost_estimate_usd"] > 0.0
