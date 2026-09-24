from unittest.mock import AsyncMock, patch

import pytest

from engines.rag_engine import SearchResult, hybrid_search


@pytest.mark.asyncio
async def test_hybrid_search_query_execution():
    mock_rows = [
        {
            "id": "doc-1",
            "source_type": "note",
            "source_id": "note-1",
            "content": "Tenant isolated document content",
            "metadata": '{"category": "security"}',
            "rrf_score": 0.032,
        },
        {
            "id": "doc-2",
            "source_type": "note",
            "source_id": "note-2",
            "content": "Another document about performance",
            "metadata": {"category": "ops"},
            "rrf_score": 0.015,
        },
    ]

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = mock_rows

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    with (
        patch("engines.rag_engine.tenant_connection", return_value=mock_cm),
        patch("engines.rag_engine.embed_text", return_value=[0.1] * 384),
    ):
        results = await hybrid_search(
            query="tenant security",
            tenant_id="tenant-123",
            limit=2,
        )

        assert len(results) == 2
        assert isinstance(results[0], SearchResult)
        assert results[0].id == "doc-1"
        assert results[0].metadata == {"category": "security"}
        assert results[0].score == 0.032
        assert results[1].id == "doc-2"
        assert results[1].metadata == {"category": "ops"}
