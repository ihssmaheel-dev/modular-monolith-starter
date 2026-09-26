import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from config import settings
from database.connection import tenant_connection
from database.document_repository import upsert_document_embedding
from database.usage import record_usage
from engines.embedding_engine import (
    embed_documents,
    embed_documents_async,
    embed_text,
    embed_text_async,
)
from engines.rag_engine import SearchResult, hybrid_search
from security.hmac import verify_gateway_signature
from security.pii import sanitize_metadata, sanitize_pii
from services.usage_service import record_embedding_usage_on_conn

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


async def _generate_batch_vectors(texts: list[str]) -> list[list[float]]:
    """Generate batch embeddings non-blockingly while respecting function mocks in tests."""
    if asyncio.iscoroutinefunction(embed_documents):
        return await embed_documents(texts)
    return await asyncio.to_thread(embed_documents, texts)


async def _generate_single_vector(text: str) -> list[float]:
    """Generate single embedding non-blockingly while respecting function mocks in tests."""
    if asyncio.iscoroutinefunction(embed_text):
        return await embed_text(text)
    return await asyncio.to_thread(embed_text, text, already_sanitized=True)


@router.post("/create", response_model=CreateEmbeddingsResponse)
async def create_embeddings(
    payload: CreateEmbeddingsRequest,
    x_tenant_id: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> CreateEmbeddingsResponse:
    """Generate dense vector embeddings for an array of input texts with dimension validation."""
    vectors = await _generate_batch_vectors(payload.texts)
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
    if effective_tenant_id:
        try:
            async with tenant_connection(effective_tenant_id) as conn:
                await record_embedding_usage_on_conn(
                    conn,
                    tenant_id=effective_tenant_id,
                    user_id=x_user_id,
                    text_or_texts=payload.texts,
                    record_fn=record_usage,
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
    if x_tenant_id:
        if payload.tenant_id and payload.tenant_id != x_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tenant ID in payload does not match authenticated X-Tenant-Id header",
            )
        effective_tenant_id: str | None = x_tenant_id
    else:
        effective_tenant_id = None

    sanitized_content = (
        sanitize_pii(payload.content) if settings.PII_REDACTION_ENABLED else payload.content
    )
    sanitized_metadata = (
        sanitize_metadata(payload.metadata) if settings.PII_REDACTION_ENABLED else payload.metadata
    )
    vector = await _generate_single_vector(sanitized_content)
    version = settings.EMBEDDING_MODEL_VERSION

    async with tenant_connection(effective_tenant_id) as conn:
        await upsert_document_embedding(
            conn,
            doc_id=payload.id,
            tenant_id=effective_tenant_id,
            source_type=payload.source_type,
            source_id=payload.source_id,
            model_version=version,
            content=sanitized_content,
            embedding=vector,
            metadata=sanitized_metadata,
        )
        await record_embedding_usage_on_conn(
            conn,
            tenant_id=effective_tenant_id,
            user_id=x_user_id,
            text_or_texts=sanitized_content,
            record_fn=record_usage,
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
    async with tenant_connection(effective_tenant_id) as conn:
        results = await hybrid_search(
            query=payload.query,
            tenant_id=effective_tenant_id,
            limit=payload.limit,
            offset=payload.offset,
            conn=conn,
        )
        try:
            await record_embedding_usage_on_conn(
                conn,
                tenant_id=effective_tenant_id,
                user_id=x_user_id,
                text_or_texts=payload.query,
                record_fn=record_usage,
            )
        except Exception as exc:
            logger.warning(f"Failed to record search embedding usage ledger: {exc}")
    return results


__all__ = [
    "router",
    "CreateEmbeddingsRequest",
    "CreateEmbeddingsResponse",
    "IndexDocumentRequest",
    "SearchRequest",
    "create_embeddings",
    "index_document",
    "search_documents",
    "embed_documents",
    "embed_text",
    "embed_documents_async",
    "embed_text_async",
    "record_usage",
    "tenant_connection",
]
