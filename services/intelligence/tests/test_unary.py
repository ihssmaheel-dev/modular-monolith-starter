import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from engines.litellm_client import execute_chat_completion
from tests.conftest import create_auth_headers


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
async def test_unary_chat_endpoint_success(async_client: AsyncClient):
    payload = {
        "messages": [{"role": "user", "content": "Summarize key architectural invariants"}],
        "temperature": 0.1,
        "max_tokens": 500,
    }
    body = json.dumps(payload).encode("utf-8")
    headers = create_auth_headers("POST", "/api/v1/chat/unary", body)

    mock_litellm_result = {
        "choices": [
            {"message": {"content": "1. Outbox invariant\n2. Zero retention\n3. Dedicated schema"}}
        ],
        "model": "gpt-4o-mini",
        "usage": {"prompt_tokens": 12, "completion_tokens": 25, "total_tokens": 37},
    }

    with patch("api.unary.execute_chat_completion", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = mock_litellm_result

        response = await async_client.post("/api/v1/chat/unary", content=body, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "Outbox invariant" in data["content"]
        assert data["model"] == "gpt-4o-mini"
        assert data["usage"]["total_tokens"] == 37
