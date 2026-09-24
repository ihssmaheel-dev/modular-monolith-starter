import logging
import uuid

import asyncpg

logger = logging.getLogger("intelligence.usage")


async def record_usage(
    conn: asyncpg.Connection,
    tenant_id: str | None,
    user_id: str | None,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    cost_estimate_usd: float = 0.0,
    latency_ms: int = 0,
) -> str:
    """
    Record LLM token consumption and execution latency metrics in intelligence.usage_ledgers.
    Must be called within an active tenant transaction context.
    """
    ledger_id = f"usg_{uuid.uuid4().hex}"
    sql = """
    INSERT INTO intelligence.usage_ledgers
        (id, tenant_id, user_id, model, prompt_tokens, completion_tokens, total_tokens, cost_estimate_usd, latency_ms, created_at)
    VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());
    """
    await conn.execute(
        sql,
        ledger_id,
        tenant_id,
        user_id,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        cost_estimate_usd,
        latency_ms,
    )
    return ledger_id
