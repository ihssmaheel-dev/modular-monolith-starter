import asyncio
import json
import logging
from typing import Any

import asyncpg

from config import settings
from database.connection import tenant_connection
from database.document_repository import fetch_hybrid_rrf_rows
from engines.embedding_engine import embed_text
from schemas.search import SearchResult
from security.pii import sanitize_pii

logger = logging.getLogger("intelligence.rag")


def _map_row_to_search_result(row: Any) -> SearchResult:
    """Convert raw database row into a validated SearchResult DTO."""
    meta = row["metadata"]
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    elif not isinstance(meta, dict):
        meta = {}

    return SearchResult(
        id=row["id"],
        source_type=row["source_type"],
        source_id=row["source_id"],
        content=row["content"],
        score=float(row["rrf_score"]),
        metadata=meta,
    )


async def hybrid_search(
    query: str,
    tenant_id: str | None = None,
    limit: int = 5,
    offset: int = 0,
    dense_weight: float | None = None,
    sparse_weight: float | None = None,
    fulltext_weight: float | None = None,
    model_version: str | None = None,
    conn: asyncpg.Connection | None = None,
) -> list[SearchResult]:
    """
    Perform hybrid vector search combining pgvector dense cosine distance with
    PostgreSQL full-text keyword ranking via Reciprocal Rank Fusion (RRF).
    Executes ONNX embedding off the event loop via asyncio.to_thread and queries
    through document_repository inside tenant-isolated RLS context.
    """
    sanitized_query = sanitize_pii(query) if settings.PII_REDACTION_ENABLED else query
    query_vector = await asyncio.to_thread(embed_text, sanitized_query, already_sanitized=True)
    version = model_version or settings.EMBEDDING_MODEL_VERSION

    d_weight = dense_weight if dense_weight is not None else settings.DENSE_WEIGHT
    s_weight = (
        sparse_weight
        if sparse_weight is not None
        else (fulltext_weight if fulltext_weight is not None else settings.SPARSE_WEIGHT)
    )

    if conn is not None:
        rows = await fetch_hybrid_rrf_rows(
            conn,
            query_vector=query_vector,
            tenant_id=tenant_id,
            model_version=version,
            sanitized_query=sanitized_query,
            dense_weight=d_weight,
            rrf_k=settings.RRF_K,
            sparse_weight=s_weight,
            limit=limit,
            offset=offset,
        )
        return [_map_row_to_search_result(row) for row in rows]

    async with tenant_connection(tenant_id) as scoped_conn:
        rows = await fetch_hybrid_rrf_rows(
            scoped_conn,
            query_vector=query_vector,
            tenant_id=tenant_id,
            model_version=version,
            sanitized_query=sanitized_query,
            dense_weight=d_weight,
            rrf_k=settings.RRF_K,
            sparse_weight=s_weight,
            limit=limit,
            offset=offset,
        )
        return [_map_row_to_search_result(row) for row in rows]


__all__ = ["SearchResult", "hybrid_search"]
