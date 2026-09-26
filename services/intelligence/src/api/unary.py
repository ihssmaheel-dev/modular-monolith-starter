import logging
from enum import StrEnum
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field

from database.connection import tenant_connection
from database.usage import record_usage
from engines.litellm_client import execute_chat_completion
from security.hmac import verify_gateway_signature
from services.chat_service import run_unary_chat

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
    Synchronous unary chat completion endpoint delegating use-case orchestration
    to services/chat_service.py.
    """
    result = await run_unary_chat(
        messages=[msg.model_dump() for msg in payload.messages],
        model=payload.model,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        tenant_id=x_tenant_id,
        user_id=x_user_id,
        execute_fn=execute_chat_completion,
        record_usage_fn=record_usage,
        connection_fn=tenant_connection,
    )
    return UnaryChatResponse(**result)


__all__ = [
    "router",
    "ChatMessage",
    "ChatRole",
    "UnaryChatRequest",
    "UnaryChatResponse",
    "chat_unary",
    "execute_chat_completion",
    "record_usage",
    "tenant_connection",
]
