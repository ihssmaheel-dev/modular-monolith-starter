import logging
import os
import time
from typing import Any
from urllib.parse import urlparse

import litellm

from config import settings
from security.pii import sanitize_pii

logger = logging.getLogger("intelligence.litellm")

# Disable LiteLLM external telemetry and logger noise
litellm.telemetry = False
litellm.drop_params = True

_PROVIDER_DEFAULT_HOSTS: dict[str, str] = {
    "openai": "api.openai.com",
    "anthropic": "api.anthropic.com",
    "groq": "api.groq.com",
    "mistral": "api.mistral.ai",
    "deepseek": "api.deepseek.com",
    "gemini": "generativelanguage.googleapis.com",
    "vertex_ai": "generativelanguage.googleapis.com",
}


def resolve_egress_host(model: str, api_base: str | None = None) -> str:
    """Resolve the target egress hostname for an LLM request."""
    effective_base = api_base or os.environ.get("LITELLM_API_BASE")
    if effective_base:
        parsed = urlparse(effective_base)
        if parsed.hostname:
            return parsed.hostname.lower()

    lower_model = model.lower()
    if "claude" in lower_model or "anthropic" in lower_model:
        return _PROVIDER_DEFAULT_HOSTS["anthropic"]
    if "groq" in lower_model:
        return _PROVIDER_DEFAULT_HOSTS["groq"]
    if "mistral" in lower_model:
        return _PROVIDER_DEFAULT_HOSTS["mistral"]
    if "deepseek" in lower_model:
        return _PROVIDER_DEFAULT_HOSTS["deepseek"]
    if "gemini" in lower_model:
        return _PROVIDER_DEFAULT_HOSTS["gemini"]
    return _PROVIDER_DEFAULT_HOSTS["openai"]


def validate_egress_target(model: str, api_base: str | None = None) -> str:
    """Verify the target egress host is explicitly permitted in EGRESS_ALLOWLIST."""
    target_host = resolve_egress_host(model, api_base=api_base)
    allowed_hosts = {h.strip().lower() for h in settings.EGRESS_ALLOWLIST if h.strip()}
    if target_host not in allowed_hosts:
        raise ValueError(
            f"Egress host '{target_host}' for model '{model}' is not permitted by EGRESS_ALLOWLIST"
        )
    return target_host


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
    api_base: str | None = None,
) -> dict[str, Any]:
    """
    Execute chat completion with LiteLLM incorporating mandatory zero-data-retention
    headers, egress allowlist & timeout caps, model allowlist enforcement, and PII pre-sanitization.
    """
    target_model = model or settings.DEFAULT_CHAT_MODEL
    if target_model not in settings.allowed_models:
        raise ValueError(f"Model '{target_model}' is not in allowed models list")

    validate_egress_target(target_model, api_base=api_base)

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
    completion_kwargs: dict[str, Any] = {
        "model": target_model,
        "messages": sanitized_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "timeout": settings.EGRESS_TIMEOUT_SECONDS,
        "extra_headers": headers,
    }
    if api_base:
        completion_kwargs["api_base"] = api_base

    response = await litellm.acompletion(**completion_kwargs)
    latency_ms = int((time.time() - start_time) * 1000)

    result = response.model_dump()
    choices = result.get("choices", [])
    if choices:
        reply_content = choices[0].get("message", {}).get("content", "") or ""
        if len(reply_content.encode("utf-8")) > settings.MAX_RESPONSE_BYTES:
            raise ValueError(
                f"Upstream response size exceeds MAX_RESPONSE_BYTES ({settings.MAX_RESPONSE_BYTES})"
            )

    result["_latency_ms"] = latency_ms
    return result
