# Intelligence Engine (`apps/intelligence`)

Stateless, autonomous AI intelligence engine powered by Python 3.12+, FastAPI, and Pydantic v2.

## Overview

- **Role:** Handles LLM inference, autonomous agents, semantic embeddings, and streaming responses.
- **Security:** Private network only (internal Docker bridge). Authenticated via `X-Internal-Token`.
- **Optionality:** 100% optional. If not running, the primary TypeScript monolith runs with zero errors.

## Development

```bash
# From apps/intelligence directory:
uv sync
uv run uvicorn src.main:app --reload --port 8000

# Run tests:
uv run pytest
```

## Endpoints

- `GET /api/v1/health` — Health check, uptime, and system status
- `POST /api/v1/chat` — Synchronous chat completion
- `POST /api/v1/chat/stream` — Real-time Server-Sent Events (SSE) token stream
- `POST /api/v1/embeddings` — Dense vector generation
