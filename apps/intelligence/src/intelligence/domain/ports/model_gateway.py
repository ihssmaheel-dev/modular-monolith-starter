from typing import Protocol

from intelligence.domain.models.embedding import EmbeddingInput, EmbeddingOutput
from intelligence.domain.models.generation import GenerationInput, GenerationOutput


class ModelGateway(Protocol):
    async def generate(self, request: GenerationInput) -> GenerationOutput: ...

    async def embed(self, request: EmbeddingInput) -> EmbeddingOutput: ...
