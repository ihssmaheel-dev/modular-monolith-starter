import logging

import instructor
import litellm
from pydantic import BaseModel

from config import settings
from engines.litellm_client import get_zero_retention_headers, validate_egress_target
from security.pii import sanitize_pii

logger = logging.getLogger("intelligence.instructor")

# Create an Instructor client wrapping LiteLLM's asynchronous completion
instructor_client = instructor.from_litellm(litellm.acompletion)


async def extract_structured[T: BaseModel](
    response_model: type[T],
    text: str,
    system_prompt: str = "You are a precise information extraction engine. Return only structured data matching the schema.",
    model: str | None = None,
    temperature: float = 0.0,
    api_base: str | None = None,
) -> T:
    """
    Extract structured, validated Pydantic data models from freeform text
    using Instructor, enforcing model allowlist, egress allowlist, PII sanitization, and zero-retention flags.
    """
    target_model = model or settings.DEFAULT_CHAT_MODEL
    if target_model not in settings.allowed_models:
        raise ValueError(f"Model '{target_model}' is not in allowed models list")

    validate_egress_target(target_model, api_base=api_base)

    sanitized_text = sanitize_pii(text) if settings.PII_REDACTION_ENABLED else text

    headers = get_zero_retention_headers(target_model) if settings.ZERO_RETENTION_ENABLED else {}

    create_kwargs: dict[str, object] = {
        "model": target_model,
        "response_model": response_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": sanitized_text},
        ],
        "temperature": temperature,
        "timeout": settings.EGRESS_TIMEOUT_SECONDS,
        "extra_headers": headers,
    }
    if api_base:
        create_kwargs["api_base"] = api_base

    result: T = await instructor_client.chat.completions.create(**create_kwargs)  # type: ignore[arg-type]

    return result
