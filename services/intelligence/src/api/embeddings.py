import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from config import settings
from database.connection import tenant_connection
from database.usage import record_usage
from engines.embedding_engine import embed_documents, embed_text
from engines.rag_engine import SearchResult, hybrid_search
from security.hmac import verify_gateway_signature
from security.pii import sanitize_metadata, sanitize_pii

logger = logging.getLogger("intelligence.embeddings")

router = APIRouter(
    prefix="/api/v1/embeddings",
    dependencies=[Depends(verify_gateway_signature)],
    tags=["Embeddings"],
)


BoundedEmbeddingText = Annotated[str, Field(min_length=1, max_length=10_000)]


class CreateEmbeddingsRequest(BaseModel):
    texts: list[BoundedEmbeddingText] = Field(..., min_length=1, max_length=100)


class CreateEmbeddingsResponse(BaseModel):
    embeddings: list[list[float]]
    model_version: str
    dimension: int


class IndexDocumentRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    tenant_id: str | None = Field(default=None, max_length=128)
    source_type: str = Field(..., min_length=1, max_length=64)
    source_id: str = Field(..., min_length=1, max_length=128)
    content: str = Field(..., min_length=1, max_length=50_000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2_000)
    tenant_id: str | None = Field(default=None, max_length=128)
    limit: int = Field(default=5, ge=1, le=50)
    offset: int = Field(default=0, ge=0, le=10_000)


def _estimate_embedding_cost(token_count: int) -> float:
    """Estimate cost in USD for embedding tokens ($0.02 per 1M tokens)."""
    return round(token_count * 0.00000002, 8)


@router.post("/create", response_model=CreateEmbeddingsResponse)
async def create_embeddings(
    payload: CreateEmbeddingsRequest,
    x_tenant_id: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> CreateEmbeddingsResponse:
    """Generate dense vector embeddings for an array of input texts with dimension validation."""
    vectors = embed_documents(payload.texts)
    if not vectors:
        return CreateEmbeddingsResponse(
            embeddings=[],
            model_version=settings.EMBEDDING_MODEL_VERSION,
            dimension=settings.VECTOR_DIMENSION,
        )

    dimension = len(vectors[0])
    if dimension != settings.VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding dimension mismatch: expected {settings.VECTOR_DIMENSION}, got {dimension}",
        )

    effective_tenant_id = x_tenant_id if x_tenant_id else None
    try:
        total_chars = sum(len(t) for t in payload.texts)
        est_tokens = max(1, total_chars // 4)
        async with tenant_connection(effective_tenant_id) as conn:
            await record_usage(
                conn=conn,
                tenant_id=effective_tenant_id,
                user_id=x_user_id,
                model=settings.DEFAULT_EMBEDDING_MODEL,
                prompt_tokens=est_tokens,
                completion_tokens=0,
                total_tokens=est_tokens,
                cost_estimate_usd=_estimate_embedding_cost(est_tokens),
                latency_ms=0,
            )
    except Exception as exc:
        logger.warning(f"Failed to record embedding usage ledger: {exc}")

    return CreateEmbeddingsResponse(
        embeddings=vectors,
        model_version=settings.EMBEDDING_MODEL_VERSION,
        dimension=dimension,
    )


@router.post("/index", status_code=status.HTTP_201_CREATED)
async def index_document(
    payload: IndexDocumentRequest,
    x_tenant_id: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    """
    Store or update a document embedding in the intelligence.document_embeddings table
    with mandatory PII sanitization and PostgreSQL Row-Level Security tenant isolation.
    """
    # Enforce tenant identity consistency with verified header
    if x_tenant_id:
        if payload.tenant_id and payload.tenant_id != x_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tenant ID in payload does not match authenticated X-Tenant-Id header",
            )
        effective_tenant_id: str | None = x_tenant_id
    else:
        # Single-tenant mode convention stores NULL
        effective_tenant_id = None

    # Unified PII redaction gated on settings.PII_REDACTION_ENABLED without double-sanitization
    sanitized_content = (
        sanitize_pii(payload.content) if settings.PII_REDACTION_ENABLED else payload.content
    )
    sanitized_metadata = (
        sanitize_metadata(payload.metadata) if settings.PII_REDACTION_ENABLED else payload.metadata
    )
    vector = embed_text(sanitized_content, already_sanitized=True)
    version = settings.EMBEDDING_MODEL_VERSION

    sql = """
    INSERT INTO intelligence.document_embeddings
        (id, tenant_id, source_type, source_id, model_version, content, embedding, metadata, updated_at)
    VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (tenant_id, source_type, source_id, model_version)
    DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    """

    est_tokens = max(1, len(sanitized_content) // 4)
    async with tenant_connection(effective_tenant_id) as conn:
        await conn.execute(
            sql,
            payload.id,
            effective_tenant_id,
            payload.source_type,
            payload.source_id,
            version,
            sanitized_content,
            vector,
            json.dumps(sanitized_metadata),
        )
        await record_usage(
            conn=conn,
            tenant_id=effective_tenant_id,
            user_id=x_user_id,
            model=settings.DEFAULT_EMBEDDING_MODEL,
            prompt_tokens=est_tokens,
            completion_tokens=0,
            total_tokens=est_tokens,
            cost_estimate_usd=_estimate_embedding_cost(est_tokens),
            latency_ms=0,
        )

    return {"status": "indexed", "id": payload.id}


@router.post("/search", response_model=list[SearchResult])
async def search_documents(
    payload: SearchRequest,
    x_tenant_id: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> list[SearchResult]:
    """Perform hybrid dense/sparse vector search with strict RLS tenant isolation."""
    effective_tenant_id = x_tenant_id if x_tenant_id else None
    results = await hybrid_search(
        query=payload.query,
        tenant_id=effective_tenant_id,
        limit=payload.limit,
        offset=payload.offset,
    )
    try:
        est_tokens = max(1, len(payload.query) // 4)
        async with tenant_connection(effective_tenant_id) as conn:
            await record_usage(
                conn=conn,
                tenant_id=effective_tenant_id,
                user_id=x_user_id,
                model=settings.DEFAULT_EMBEDDING_MODEL,
                prompt_tokens=est_tokens,
                completion_tokens=0,
                total_tokens=est_tokens,
                cost_estimate_usd=_estimate_embedding_cost(est_tokens),
                latency_ms=0,
            )
    except Exception as exc:
        logger.warning(f"Failed to record search embedding usage ledger: {exc}")
    return results
