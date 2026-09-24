from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from database.connection import system_connection, tenant_connection
from engines.rag_engine import hybrid_search


def _build_mock_pool(mock_conn: AsyncMock) -> MagicMock:
    # connection.transaction() is a synchronous call returning an async context manager in asyncpg
    mock_tx = AsyncMock()
    mock_tx.__aenter__.return_value = None
    mock_tx.__aexit__.return_value = None
    mock_conn.transaction = MagicMock(return_value=mock_tx)

    # pool.acquire() returns an async context manager yielding connection
    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    mock_pool = MagicMock()
    mock_pool.acquire.return_value = mock_cm
    return mock_pool


@pytest.mark.asyncio
async def test_tenant_connection_multi_mode_sets_gucs():
    mock_conn = AsyncMock()
    mock_pool = _build_mock_pool(mock_conn)

    with patch("database.connection.init_pool", return_value=mock_pool):
        async with tenant_connection("tenant-alpha") as conn:
            assert conn == mock_conn

        # Verify GUCs set for multi-tenant isolation
        mock_conn.execute.assert_called_once()
        args = mock_conn.execute.call_args[0]
        assert "app.tenancy_mode" in args[0]
        assert "app.current_tenant" in args[0]
        assert args[1] == "tenant-alpha"


@pytest.mark.asyncio
async def test_tenant_connection_single_mode_sets_gucs_and_empty_tenant():
    mock_conn = AsyncMock()
    mock_pool = _build_mock_pool(mock_conn)

    with patch("database.connection.init_pool", return_value=mock_pool):
        async with tenant_connection(None) as conn:
            assert conn == mock_conn

        mock_conn.execute.assert_called_once()
        args = mock_conn.execute.call_args[0]
        assert "app.tenancy_mode" in args[0]
        assert "'single'" in args[0]
        assert "app.current_tenant" in args[0]
        assert "''" in args[0]


@pytest.mark.asyncio
async def test_system_connection_sets_system_scope():
    mock_conn = AsyncMock()
    mock_pool = _build_mock_pool(mock_conn)

    with patch("database.connection.init_pool", return_value=mock_pool):
        async with system_connection() as conn:
            assert conn == mock_conn

        mock_conn.execute.assert_called_once()
        args = mock_conn.execute.call_args[0]
        assert "app.system_scope" in args[0]
        assert "'true'" in args[0]


@pytest.mark.asyncio
async def test_hybrid_search_tenant_isolation_boundary():
    """Verify that hybrid search isolates queries strictly to the target tenant."""
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = []

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    with (
        patch("engines.rag_engine.tenant_connection", return_value=mock_cm) as mock_tc,
        patch("engines.rag_engine.embed_text", return_value=[0.0] * 384),
    ):
        await hybrid_search(query="confidential data", tenant_id="tenant-A")
        # Assert tenant_connection was entered with tenant-A
        mock_tc.assert_called_once_with("tenant-A")

        # Assert query executed with tenant-A parameter
        sql_args = mock_conn.fetch.call_args[0]
        assert sql_args[2] == "tenant-A"


@pytest.mark.asyncio
async def test_hybrid_search_single_mode_null_tenant():
    """Verify single-mode hybrid search passes None/NULL for tenant matching."""
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = []

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    with (
        patch("engines.rag_engine.tenant_connection", return_value=mock_cm) as mock_tc,
        patch("engines.rag_engine.embed_text", return_value=[0.0] * 384),
    ):
        await hybrid_search(query="public document", tenant_id=None)
        mock_tc.assert_called_once_with(None)

        sql_args = mock_conn.fetch.call_args[0]
        assert sql_args[2] is None
