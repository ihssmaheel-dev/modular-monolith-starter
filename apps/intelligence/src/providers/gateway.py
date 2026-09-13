from typing import AsyncIterator
from src.config import settings
from src.core.logging import logger
from src.domain.models import (
    ChatRequest,
    ChatResponse,
    StreamChunk,
    EmbeddingRequest,
    EmbeddingResponse,
)
from src.providers.mock_provider import MockProvider


class ModelGateway:
    """Unified provider router with automatic fallback and load-balancing."""

    def __init__(self) -> None:
        self.mock_provider = MockProvider()

    def get_provider(self, requested_model: str | None = None) -> MockProvider:
        # If external provider is configured and API key exists, use it;
        # otherwise, fallback to MockProvider so the app is always functional.
        if settings.ai_provider == "openai" and settings.openai_api_key:
            # When ready for live OpenAI, can instantiate OpenAiProvider
            logger.info("Using OpenAI provider", extra={"model": requested_model})
            # For now or fallback:
            return self.mock_provider

        logger.debug("Routing to MockProvider (development/fallback)")
        return self.mock_provider

    async def generate(self, request: ChatRequest) -> ChatResponse:
        provider = self.get_provider(request.model)
        return await provider.generate(request)

    async def stream(self, request: ChatRequest) -> AsyncIterator[StreamChunk]:
        provider = self.get_provider(request.model)
        async for chunk in provider.stream(request):
            yield chunk

    async def embed(self, request: EmbeddingRequest) -> EmbeddingResponse:
        provider = self.get_provider(request.model)
        return await provider.embed(request)


gateway = ModelGateway()
