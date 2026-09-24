import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from config import settings
from database.connection import tenant_connection
from engines.embedding_engine import embed_documents, embed_text
from engines.rag_engine import SearchResult, hybrid_search
from security.hmac import verify_gateway_signature
from security.pii import sanitize_pii

router = APIRouter(
    prefix="/api/v1/embeddings",
    dependencies=[Depends(verify_gateway_signature)],
    tags=["Embeddings"],
)


class CreateEmbeddingsRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100)


class CreateEmbeddingsResponse(BaseModel):
    embeddings: list[list[float]]
    model_version: str
    dimension: int


class IndexDocumentRequest(BaseModel):
    id: str
    tenant_id: str | None = None
    source_type: str
    source_id: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    tenant_id: str | None = None
    limit: int = Field(default=5, ge=1, le=50)
    offset: int = Field(default=0, ge=0)


@router.post("/create", response_model=CreateEmbeddingsResponse)
async def create_embeddings(payload: CreateEmbeddingsRequest) -> CreateEmbeddingsResponse:
    """Generate dense vector embeddings for an array of input texts."""
    vectors = embed_documents(payload.texts)
    dimension = len(vectors[0]) if vectors else settings.VECTOR_DIMENSION
    return CreateEmbeddingsResponse(
        embeddings=vectors,
        model_version=settings.EMBEDDING_MODEL_VERSION,
        dimension=dimension,
    )


@router.post("/index", status_code=status.HTTP_201_CREATED)
async def index_document(
    payload: IndexDocumentRequest,
    x_tenant_id: Annotated[str | None, Header()] = None,
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

    # Load-bearing PII redaction before vector generation and storage
    sanitized_content = sanitize_pii(payload.content)
    vector = embed_text(sanitized_content)
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
            json.dumps(payload.metadata),
        )

    return {"status": "indexed", "id": payload.id}


@router.post("/search", response_model=list[SearchResult])
async def search_documents(
    payload: SearchRequest,
    x_tenant_id: Annotated[str | None, Header()] = None,
) -> list[SearchResult]:
    """Perform hybrid dense/sparse vector search with strict RLS tenant isolation."""
    effective_tenant_id = x_tenant_id if x_tenant_id else None
    return await hybrid_search(
        query=payload.query,
        tenant_id=effective_tenant_id,
        limit=payload.limit,
        offset=payload.offset,
    )
