import json
from typing import Any

import asyncpg

from config import settings

UPSERT_DOCUMENT_SQL = """
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

HYBRID_RRF_SEARCH_SQL = """
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
    LIMIT $10
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
    LIMIT $10
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


async def upsert_document_embedding(
    conn: asyncpg.Connection,
    *,
    doc_id: str,
    tenant_id: str | None,
    source_type: str,
    source_id: str,
    model_version: str,
    content: str,
    embedding: list[float],
    metadata: Any,
) -> None:
    """Persist or update a document embedding within an active tenant-scoped connection."""
    serialized_metadata = json.dumps(metadata) if not isinstance(metadata, str) else metadata
    await conn.execute(
        UPSERT_DOCUMENT_SQL,
        doc_id,
        tenant_id,
        source_type,
        source_id,
        model_version,
        content,
        embedding,
        serialized_metadata,
    )


async def fetch_hybrid_rrf_rows(
    conn: asyncpg.Connection,
    *,
    query_vector: list[float],
    tenant_id: str | None,
    model_version: str,
    sanitized_query: str,
    dense_weight: float,
    rrf_k: int,
    sparse_weight: float,
    limit: int,
    offset: int,
    candidate_limit: int | None = None,
) -> list[Any]:
    """Execute hybrid dense+sparse RRF query within an active tenant-scoped connection."""
    leg_limit = candidate_limit or settings.RRF_CANDIDATE_LIMIT
    return await conn.fetch(
        HYBRID_RRF_SEARCH_SQL,
        query_vector,
        tenant_id,
        model_version,
        sanitized_query,
        dense_weight,
        rrf_k,
        sparse_weight,
        limit,
        offset,
        leg_limit,
    )
