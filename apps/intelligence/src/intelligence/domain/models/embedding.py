from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EmbeddingInput:
    request_id: str
    tenant_id: str
    texts: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class EmbeddingOutput:
    model: str
    vectors: tuple[tuple[float, ...], ...]
