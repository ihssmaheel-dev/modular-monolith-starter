from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_endpoint(async_client: AsyncClient):
    response = await async_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "intelligence"
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_liveness_probe(async_client: AsyncClient):
    response = await async_client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_readiness_probe_healthy(async_client: AsyncClient):
    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = 1

    mock_cm = AsyncMock()
    mock_cm.__aenter__.return_value = mock_conn
    mock_cm.__aexit__.return_value = None

    with patch("api.health.get_connection", return_value=mock_cm):
        response = await async_client.get("/health/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["database"] == "ok"


@pytest.mark.asyncio
async def test_readiness_probe_database_down(async_client: AsyncClient):
    mock_cm = AsyncMock()
    mock_cm.__aenter__.side_effect = ConnectionError("Could not connect to PostgreSQL")

    with patch("api.health.get_connection", return_value=mock_cm):
        response = await async_client.get("/health/ready")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert data["database"] == "unavailable"
