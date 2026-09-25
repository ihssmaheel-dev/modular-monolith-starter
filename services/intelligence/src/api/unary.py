import logging
from enum import StrEnum
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from config import settings
from database.connection import tenant_connection
from database.usage import record_usage
from engines.litellm_client import execute_chat_completion
from security.hmac import verify_gateway_signature

logger = logging.getLogger("intelligence.unary")

router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_gateway_signature)])


class ChatRole(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessage(BaseModel):
    role: ChatRole
    content: str = Field(..., min_length=1, max_length=10_000)


class UnaryChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=100)
    model: str | None = None
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=8192)


class UnaryChatResponse(BaseModel):
    content: str
    model: str
    usage: dict[str, Any] = Field(default_factory=dict)


@router.post("/chat/unary", response_model=UnaryChatResponse)
async def chat_unary(
    payload: UnaryChatRequest,
    x_tenant_id: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> UnaryChatResponse:
    """
    Synchronous unary chat completion for non-streaming queries
    (classification, quick summaries, metadata tagging).
    Enforces runtime model allowlist and records token telemetry in usage_ledgers.
    """
    target_model = payload.model or settings.DEFAULT_CHAT_MODEL
    if target_model not in settings.allowed_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model '{target_model}' is not in allowed models list",
        )

    try:
        raw_response = await execute_chat_completion(
            messages=[msg.model_dump() for msg in payload.messages],
            model=target_model,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(f"Upstream LLM completion failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Upstream intelligence provider error",
        ) from exc

    choice = raw_response["choices"][0]["message"]
    content = choice.get("content", "")
    model = raw_response.get("model", target_model)
    usage = raw_response.get("usage", {})
    latency_ms = raw_response.get("_latency_ms", 0)

    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

    cost_estimate_usd = 0.0
    try:
        import litellm

        cost_estimate_usd = float(litellm.completion_cost(completion_response=raw_response))
    except Exception:
        cost_estimate_usd = 0.0

    if cost_estimate_usd <= 0.0 and total_tokens > 0:
        if prompt_tokens or completion_tokens:
            cost_estimate_usd = round(
                (prompt_tokens * 0.00000015) + (completion_tokens * 0.00000060), 8
            )
        else:
            cost_estimate_usd = round(total_tokens * 0.0000002, 8)

    # Record usage telemetry in tenant scope
    try:
        effective_tenant = x_tenant_id if x_tenant_id else None
        async with tenant_connection(effective_tenant) as conn:
            await record_usage(
                conn=conn,
                tenant_id=effective_tenant,
                user_id=x_user_id,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost_estimate_usd=cost_estimate_usd,
                latency_ms=latency_ms,
            )
    except Exception as exc:
        logger.warning(f"Failed to record usage ledger: {exc}")

    return UnaryChatResponse(
        content=content,
        model=model,
        usage=usage,
    )
