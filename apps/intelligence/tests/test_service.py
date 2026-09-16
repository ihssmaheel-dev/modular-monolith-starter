from pydantic import HttpUrl

from intelligence.application.services.intelligence_service import IntelligenceApplicationService
from intelligence.config.settings import Settings
from intelligence.domain.models.embedding import EmbeddingInput, EmbeddingOutput
from intelligence.domain.models.generation import GenerationInput, GenerationOutput, Usage


class FakeGateway:
    async def generate(self, request: GenerationInput) -> GenerationOutput:
        return GenerationOutput('{"answer":"ok"}', Usage(2, 3, 0), "fake", ())

    async def embed(self, request: EmbeddingInput) -> EmbeddingOutput:
        return EmbeddingOutput("fake", ((0.1, 0.2),) * len(request.texts))


def settings() -> Settings:
    return Settings(
        enabled=True,
        service_token="x" * 32,
        provider_base_url=HttpUrl("https://provider.example.test"),
        provider_api_key="x" * 32,
        model="fake",
        embedding_model="fake-embedding",
        allowed_storage_hosts=("objects.example.test",),
    )


async def test_generation_is_bounded_and_returns_usage() -> None:
    service = IntelligenceApplicationService(FakeGateway(), settings())
    result = await service.generate(
        GenerationInput("run-1", "tenant-1", "hello", (), {"type": "object"}, 10)
    )

    assert result.model == "fake"
    assert result.usage.output_tokens == 3
