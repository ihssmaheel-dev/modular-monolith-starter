from typing import Any

import asyncpg

from config import settings
from database.usage import record_usage


def estimate_tokens(text_or_texts: str | list[str]) -> int:
    """Estimate token count from character length using configured CHARS_PER_TOKEN_ESTIMATE."""
    divisor = max(1, settings.CHARS_PER_TOKEN_ESTIMATE)
    if isinstance(text_or_texts, str):
        total_chars = len(text_or_texts)
    else:
        total_chars = sum(len(t) for t in text_or_texts)
    return max(1, total_chars // divisor)


def estimate_embedding_cost(token_count: int) -> float:
    """Estimate cost in USD for embedding tokens using configured rate."""
    return round(token_count * settings.EMBEDDING_COST_PER_TOKEN_USD, 8)


def estimate_chat_cost(
    raw_response: dict[str, Any],
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
) -> float:
    """Estimate LLM completion cost in USD via LiteLLM with deterministic fallback rates."""
    cost_usd = 0.0
    try:
        import litellm

        cost_usd = float(litellm.completion_cost(completion_response=raw_response))
    except Exception:
        cost_usd = 0.0

    if cost_usd <= 0.0 and total_tokens > 0:
        if prompt_tokens or completion_tokens:
            cost_usd = round(
                (prompt_tokens * settings.CHAT_PROMPT_COST_PER_TOKEN_USD)
                + (completion_tokens * settings.CHAT_COMPLETION_COST_PER_TOKEN_USD),
                8,
            )
        else:
            cost_usd = round(total_tokens * settings.CHAT_PROMPT_COST_PER_TOKEN_USD, 8)
    return cost_usd


async def record_embedding_usage_on_conn(
    conn: asyncpg.Connection,
    *,
    tenant_id: str | None,
    user_id: str | None,
    text_or_texts: str | list[str],
    record_fn=record_usage,
) -> None:
    """Record embedding token usage on an already-acquired tenant-scoped connection."""
    est_tokens = estimate_tokens(text_or_texts)
    await record_fn(
        conn=conn,
        tenant_id=tenant_id,
        user_id=user_id,
        model=settings.DEFAULT_EMBEDDING_MODEL,
        prompt_tokens=est_tokens,
        completion_tokens=0,
        total_tokens=est_tokens,
        cost_estimate_usd=estimate_embedding_cost(est_tokens),
        latency_ms=0,
    )
