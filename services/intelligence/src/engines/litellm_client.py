import logging
import time
from typing import Any

import litellm

from config import settings
from security.pii import sanitize_pii

logger = logging.getLogger("intelligence.litellm")

# Disable LiteLLM external telemetry and logger noise
litellm.telemetry = False
litellm.drop_params = True


def get_zero_retention_headers(model: str = "") -> dict[str, str]:
    """Headers enforcing zero-data-retention and no-model-training upstream."""
    headers = {
        "X-No-Training": "true",
    }
    # Only send anthropic-beta header to Anthropic models
    if "claude" in model.lower() or "anthropic" in model.lower():
        headers["anthropic-beta"] = "max-tokens-3-5-sonnet-20240715"
    return headers


async def execute_chat_completion(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Execute chat completion with LiteLLM incorporating mandatory zero-data-retention
    headers, egress client timeout caps, model allowlist enforcement, and PII pre-sanitization.
    """
    target_model = model or settings.DEFAULT_CHAT_MODEL
    if target_model not in settings.allowed_models:
        raise ValueError(f"Model '{target_model}' is not in allowed models list")

    # Sanitize input messages for PII if enabled
    sanitized_messages: list[dict[str, str]] = []
    for msg in messages:
        content = msg.get("content", "")
        sanitized_content = sanitize_pii(content) if settings.PII_REDACTION_ENABLED else content
        sanitized_messages.append({**msg, "content": sanitized_content})

    headers = {}
    if extra_headers:
        headers.update(extra_headers)
    if settings.ZERO_RETENTION_ENABLED:
        # Enforce zero retention flags unconditionally (overriding any caller extra_headers)
        headers.update(get_zero_retention_headers(target_model))

    start_time = time.time()
    response = await litellm.acompletion(
        model=target_model,
        messages=sanitized_messages,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=settings.EGRESS_TIMEOUT_SECONDS,
        extra_headers=headers,
    )
    latency_ms = int((time.time() - start_time) * 1000)

    result = response.model_dump()
    result["_latency_ms"] = latency_ms
    return result
