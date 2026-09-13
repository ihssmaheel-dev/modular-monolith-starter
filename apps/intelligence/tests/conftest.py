import pytest
from fastapi.testclient import TestClient
from src.config import settings
from src.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-Internal-Token": settings.internal_secret}
