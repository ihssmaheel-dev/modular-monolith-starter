from typing import Any, cast

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from intelligence.api.dependencies.auth import require_internal_service
from intelligence.application.services.document_service import DocumentService
from intelligence.application.services.intelligence_service import IntelligenceApplicationService
from intelligence.config.settings import Settings
from intelligence.domain.models.embedding import EmbeddingInput
from intelligence.domain.models.generation import ContextItem, GenerationInput

router = APIRouter(prefix="/internal/v1", tags=["internal"])


class ContextItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    citation_id: str = Field(min_length=1, max_length=128)
    content: str = Field(min_length=1, max_length=100_000)
    source: str = Field(min_length=1, max_length=512)


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(min_length=1, max_length=128)
    tenant_id: str = Field(min_length=1, max_length=128)
    prompt: str = Field(min_length=1, max_length=500_000)
    context: list[ContextItemRequest] = Field(
        default_factory=lambda: cast(list[ContextItemRequest], []), max_length=100
    )
    output_schema: dict[str, Any] | None = None
    max_output_tokens: int = Field(default=2_048, ge=1, le=16_384)


class GenerationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    model: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    citations: list[str]


class EmbeddingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(min_length=1, max_length=128)
    tenant_id: str = Field(min_length=1, max_length=128)
    texts: list[str] = Field(min_length=1, max_length=100)


class EmbeddingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str
    vectors: list[list[float]]


class ParseDocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signed_url: HttpUrl
    tenant_id: str = Field(min_length=1, max_length=128)
    document_id: str = Field(min_length=1, max_length=128)


class ParsedChunkResponse(BaseModel):
    ordinal: int
    content: str
    content_hash: str


class ParseDocumentResponse(BaseModel):
    content_type: str
    chunks: list[ParsedChunkResponse]


def internal_auth(
    settings: Settings = Depends(),  # noqa: B008
    authorization: str | None = Header(default=None),
    x_service_audience: str | None = Header(default=None),
) -> None:
    require_internal_service(settings, authorization, x_service_audience)


@router.post(
    "/generations", response_model=GenerationResponse, dependencies=[Depends(internal_auth)]
)
async def generate(
    request: GenerationRequest,
    service: IntelligenceApplicationService = Depends(),  # noqa: B008
) -> GenerationResponse:
    result = await service.generate(
        GenerationInput(
            run_id=request.run_id,
            tenant_id=request.tenant_id,
            prompt=request.prompt,
            context=tuple(
                ContextItem(item.citation_id, item.content, item.source) for item in request.context
            ),
            output_schema=request.output_schema,
            max_output_tokens=request.max_output_tokens,
        )
    )
    return GenerationResponse(
        content=result.content,
        model=result.model,
        input_tokens=result.usage.input_tokens,
        output_tokens=result.usage.output_tokens,
        estimated_cost_usd=result.usage.estimated_cost_usd,
        citations=list(result.citations),
    )


@router.post("/embeddings", response_model=EmbeddingResponse, dependencies=[Depends(internal_auth)])
async def embed(
    request: EmbeddingRequest,
    service: IntelligenceApplicationService = Depends(),  # noqa: B008
) -> EmbeddingResponse:
    result = await service.embed(
        EmbeddingInput(request.request_id, request.tenant_id, tuple(request.texts))
    )
    return EmbeddingResponse(
        model=result.model, vectors=[list(vector) for vector in result.vectors]
    )


@router.post(
    "/documents/parse",
    response_model=ParseDocumentResponse,
    dependencies=[Depends(internal_auth)],
)
async def parse_document(
    request: ParseDocumentRequest,
    service: DocumentService = Depends(),  # noqa: B008
) -> ParseDocumentResponse:
    parsed = await service.parse_signed_object(str(request.signed_url))
    return ParseDocumentResponse(
        content_type=parsed.content_type,
        chunks=[
            ParsedChunkResponse(
                ordinal=chunk.ordinal, content=chunk.content, content_hash=chunk.content_hash
            )
            for chunk in parsed.chunks
        ],
    )
