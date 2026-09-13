import json
from typing import AsyncIterator
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from src.core.security import verify_internal_token
from src.domain.models import ChatRequest, ChatResponse
from src.providers.gateway import gateway

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse, dependencies=[Depends(verify_internal_token)])
async def chat_completion(request: ChatRequest) -> ChatResponse:
    """Synchronous chat completion endpoint."""
    return await gateway.generate(request)


@router.post("/stream", dependencies=[Depends(verify_internal_token)])
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    """Real-time token-by-token Server-Sent Events (SSE) streaming endpoint."""

    async def event_generator() -> AsyncIterator[str]:
        async for chunk in gateway.stream(request):
            data = json.dumps(chunk.model_dump(by_alias=True))
            yield f"data: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
