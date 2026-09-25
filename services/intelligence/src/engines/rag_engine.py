import json
import logging
from typing import Any

from pydantic import BaseModel, Field

from config import settings
from database.connection import tenant_connection
from engines.embedding_engine import embed_text
from security.pii import sanitize_pii

logger = logging.getLogger("intelligence.rag")


class SearchResult(BaseModel):
    id: str
    source_type: str
    source_id: str
    content: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


async def hybrid_search(
    query: str,
    tenant_id: str | None = None,
    limit: int = 5,
    offset: int = 0,
    dense_weight: float | None = None,
    fulltext_weight: float | None = None,
    model_version: str | None = None,
) -> list[SearchResult]:
    """
    Perform hybrid vector search combining pgvector dense cosine distance with
    PostgreSQL full-text keyword ranking via Reciprocal Rank Fusion (RRF).
    Guarantees strict tenant isolation by executing inside tenant_connection(tenant_id)
    with active PostgreSQL Row-Level Security (RLS) and sanitized FTS queries.
    """
    sanitized_query = sanitize_pii(query) if settings.PII_REDACTION_ENABLED else query
    query_vector = embed_text(sanitized_query, already_sanitized=True)
    version = model_version or settings.EMBEDDING_MODEL_VERSION

    # Reciprocal Rank Fusion (RRF) algorithm constants from config
    rrf_k = settings.RRF_K
    d_weight = dense_weight if dense_weight is not None else settings.DENSE_WEIGHT
    s_weight = fulltext_weight if fulltext_weight is not None else settings.SPARSE_WEIGHT

    sql = """
    WITH dense_search AS (
        SELECT
            id,
            source_type,
            source_id,
            content,
            metadata,
            ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS dense_rank
        FROM intelligence.document_embeddings
        WHERE tenant_id IS NOT DISTINCT FROM $2
          AND model_version = $3
        LIMIT 50
    ),
    sparse_search AS (
        SELECT
            id,
            source_type,
            source_id,
            content,
            metadata,
            ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $4)) DESC) AS sparse_rank
        FROM intelligence.document_embeddings
        WHERE tenant_id IS NOT DISTINCT FROM $2
          AND model_version = $3
          AND to_tsvector('english', content) @@ plainto_tsquery('english', $4)
        LIMIT 50
    )
    SELECT
        COALESCE(d.id, s.id) AS id,
        COALESCE(d.source_type, s.source_type) AS source_type,
        COALESCE(d.source_id, s.source_id) AS source_id,
        COALESCE(d.content, s.content) AS content,
        COALESCE(d.metadata, s.metadata) AS metadata,
        (
            COALESCE($5 * (1.0 / ($6 + d.dense_rank)), 0.0) +
            COALESCE($7 * (1.0 / ($6 + s.sparse_rank)), 0.0)
        ) AS rrf_score
    FROM dense_search d
    FULL OUTER JOIN sparse_search s ON d.id = s.id
    ORDER BY rrf_score DESC
    LIMIT $8 OFFSET $9;
    """

    async with tenant_connection(tenant_id) as conn:
        rows = await conn.fetch(
            sql,
            query_vector,
            tenant_id,
            version,
            sanitized_query,
            d_weight,
            rrf_k,
            s_weight,
            limit,
            offset,
        )

    results = []
    for r in rows:
        meta = r["metadata"]
        if isinstance(meta, str):
            meta = json.loads(meta)
        results.append(
            SearchResult(
                id=r["id"],
                source_type=r["source_type"],
                source_id=r["source_id"],
                content=r["content"],
                score=float(r["rrf_score"]),
                metadata=meta,
            )
        )

    return results
