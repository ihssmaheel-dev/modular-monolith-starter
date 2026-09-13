import asyncio
import time
from typing import AsyncIterator
from src.domain.models import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    FinishReason,
    MessageRole,
    StreamChunk,
    StreamChunkType,
    TokenUsage,
    EmbeddingRequest,
    EmbeddingResponse,
    EmbeddingResponseUsage,
)


class MockProvider:
    """Deterministic, zero-credential provider for local development, CI, and testing."""

    async def generate(self, request: ChatRequest) -> ChatResponse:
        start = time.perf_counter()
        last_msg = request.messages[-1].content
        reply = f"[Mock AI] Echo: {last_msg}"

        latency_ms = (time.perf_counter() - start) * 1000
        prompt_tokens = sum(len(m.content.split()) for m in request.messages)
        completion_tokens = len(reply.split())

        return ChatResponse(
            message=ChatMessage(role=MessageRole.ASSISTANT, content=reply),
            finishReason=FinishReason.STOP,
            model=request.model or "mock-model",
            usage=TokenUsage(
                promptTokens=prompt_tokens,
                completionTokens=completion_tokens,
                totalTokens=prompt_tokens + completion_tokens,
            ),
            latencyMs=round(latency_ms, 2),
        )

    async def stream(self, request: ChatRequest) -> AsyncIterator[StreamChunk]:
        last_msg = request.messages[-1].content
        tokens = f"[Mock AI] Echo: {last_msg}".split()

        for idx, token in enumerate(tokens):
            await asyncio.sleep(0.01)  # Simulate real token pacing
            yield StreamChunk(
                type=StreamChunkType.TOKEN,
                content=token + " ",
                seq=idx,
            )

        prompt_tokens = sum(len(m.content.split()) for m in request.messages)
        completion_tokens = len(tokens)

        yield StreamChunk(
            type=StreamChunkType.DONE,
            usage=TokenUsage(
                promptTokens=prompt_tokens,
                completionTokens=completion_tokens,
                totalTokens=prompt_tokens + completion_tokens,
            ),
        )

    async def embed(self, request: EmbeddingRequest) -> EmbeddingResponse:
        start = time.perf_counter()
        inputs = [request.input] if isinstance(request.input, str) else request.input

        # Deterministic 128-dimensional mock vector
        embeddings: list[list[float]] = []
        for text in inputs:
            base_val = (sum(ord(c) for c in text) % 100) / 100.0
            vector = [round((base_val + i * 0.01) % 1.0, 4) for i in range(128)]
            embeddings.append(vector)

        total_words = sum(len(t.split()) for t in inputs)
        latency_ms = (time.perf_counter() - start) * 1000

        return EmbeddingResponse(
            embeddings=embeddings,
            model=request.model or "mock-embedder",
            usage=EmbeddingResponseUsage(promptTokens=total_words, totalTokens=total_words),
            latencyMs=round(latency_ms, 2),
        )
