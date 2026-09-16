from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ContextItem:
    citation_id: str
    content: str
    source: str


@dataclass(frozen=True, slots=True)
class GenerationInput:
    run_id: str
    tenant_id: str
    prompt: str
    context: tuple[ContextItem, ...]
    output_schema: dict[str, Any] | None
    max_output_tokens: int


@dataclass(frozen=True, slots=True)
class Usage:
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float


@dataclass(frozen=True, slots=True)
class GenerationOutput:
    content: str
    usage: Usage
    model: str
    citations: tuple[str, ...]
