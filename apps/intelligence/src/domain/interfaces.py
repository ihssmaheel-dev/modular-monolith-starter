from typing import AsyncIterator, Protocol
from src.domain.models import (
    ChatRequest,
    ChatResponse,
    StreamChunk,
    EmbeddingRequest,
    EmbeddingResponse,
)


class LLMProvider(Protocol):
    """Protocol for LLM model providers."""

    async def generate(self, request: ChatRequest) -> ChatResponse: ...

    async def stream(self, request: ChatRequest) -> AsyncIterator[StreamChunk]: ...


class Embedder(Protocol):
    """Protocol for dense vector embedding generators."""

    async def embed(self, request: EmbeddingRequest) -> EmbeddingResponse: ...
