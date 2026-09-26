import logging
from typing import Any

from fastapi import HTTPException, status

from config import settings
from database.connection import tenant_connection
from database.usage import record_usage
from engines.litellm_client import execute_chat_completion
from services.usage_service import estimate_chat_cost

logger = logging.getLogger("intelligence.chat_service")


async def run_unary_chat(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    tenant_id: str | None = None,
    user_id: str | None = None,
    execute_fn=execute_chat_completion,
    record_usage_fn=record_usage,
    connection_fn=tenant_connection,
) -> dict[str, Any]:
    """
    Execute unary chat completion use case:
    1. Validates model allowlist.
    2. Invokes LiteLLM with zero retention, egress allowlist, and PII pre-scrubbing.
    3. Calculates estimated token costs with fallback rates.
    4. Safely records tenant-scoped usage ledger without failing the chat response.
    """
    target_model = model or settings.DEFAULT_CHAT_MODEL
    if target_model not in settings.allowed_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model '{target_model}' is not in allowed models list",
        )

    try:
        raw_response = await execute_fn(
            messages=messages,
            model=target_model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(f"Upstream provider failure: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Upstream intelligence provider error",
        ) from exc

    choice = raw_response["choices"][0]["message"]
    content = choice.get("content", "")
    returned_model = raw_response.get("model", target_model)
    usage = raw_response.get("usage", {})
    latency_ms = raw_response.get("_latency_ms", 0)

    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

    cost_estimate_usd = estimate_chat_cost(
        raw_response, prompt_tokens, completion_tokens, total_tokens
    )

    # Record usage telemetry in tenant scope safely
    try:
        effective_tenant = tenant_id if tenant_id else None
        async with connection_fn(effective_tenant) as conn:
            await record_usage_fn(
                conn=conn,
                tenant_id=effective_tenant,
                user_id=user_id,
                model=returned_model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost_estimate_usd=cost_estimate_usd,
                latency_ms=latency_ms,
            )
    except Exception as exc:
        logger.warning(f"Failed to record usage ledger: {exc}")

    return {
        "content": content,
        "model": returned_model,
        "usage": usage,
    }
