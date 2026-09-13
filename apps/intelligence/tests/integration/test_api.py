from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "intelligence"
    assert "uptimeSeconds" in data


def test_chat_forbidden_without_internal_token(client: TestClient):
    response = client.post(
        "/api/v1/chat",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code == 403


def test_chat_completion_with_auth(client: TestClient, auth_headers: dict[str, str]):
    response = client.post(
        "/api/v1/chat",
        headers=auth_headers,
        json={
            "messages": [
                {"role": "system", "content": "You are helpful."},
                {"role": "user", "content": "Ping"},
            ],
            "model": "mock-model",
            "temperature": 0.5,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"]["role"] == "assistant"
    assert "Ping" in data["message"]["content"]
    assert data["finishReason"] == "stop"
    assert data["usage"]["totalTokens"] > 0
    assert data["latencyMs"] >= 0


def test_chat_streaming_sse(client: TestClient, auth_headers: dict[str, str]):
    response = client.post(
        "/api/v1/chat/stream",
        headers=auth_headers,
        json={"messages": [{"role": "user", "content": "Stream test"}]},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    content = response.text
    assert "data: " in content


def test_embeddings_generation(client: TestClient, auth_headers: dict[str, str]):
    response = client.post(
        "/api/v1/embeddings",
        headers=auth_headers,
        json={"input": ["First sentence", "Second sentence"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["embeddings"]) == 2
    assert len(data["embeddings"][0]) == 128
    assert data["usage"]["totalTokens"] > 0
