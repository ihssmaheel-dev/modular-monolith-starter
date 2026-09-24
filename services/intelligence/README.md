# Python Intelligence Service (`services/intelligence`)

Optional, high-performance Python Intelligence layer for the modular monolith architecture.

## Overview

- **Runtime & Tooling:** Python 3.12+, managed with [Astral uv](https://github.com/astral-sh/uv), linted & formatted with [Ruff](https://github.com/astral-sh/ruff).
- **Web & ASGI Server:** FastAPI + Granian (Rust-based HTTP/1, HTTP/2 ASGI server).
- **Embeddings:** Local CPU ONNX inference via FastEmbed (`BAAI/bge-small-en-v1.5`, 384 dimensions, normalized).
- **Vector Store & RAG:** PostgreSQL pgvector + full-text search with Reciprocal Rank Fusion (RRF) and strict tenant isolation (`tenant_id`).
- **LLM Gateway:** LiteLLM + Instructor with automatic zero-data-retention headers (`X-No-Training: true`) and pre-egress PII sanitization.
- **Gateway Security:** HMAC-SHA256 inter-service signatures with timestamp drift window validation ($\pm 300\text{s}$) preventing direct client exposure.

## Key Architectural Invariants

1. **Strict Monorepo Isolation:** Stored under top-level `services/intelligence` outside `apps/*` and `packages/*` to eliminate any Node/Turbo build interference.
2. **Dedicated Database Schema:** Exclusively owns the `intelligence.*` database schema (`document_embeddings`, `usage_ledgers`). Never accesses or mutates `public.*` domain tables directly.
3. **Outbox Observer Integration:** Node API registers domain event topics as observers via `registerObserverTopics()`, completely eliminating `UNCLASSIFIED_DURABLE_EVENT` errors.
4. **Zero Runtime Overhead When Disabled:** Completely optional. Defaults to `INTELLIGENCE_ENABLED=false`. When disabled, Node handlers degrade gracefully using `neverthrow` Result (`AI_DISABLED`) without making network requests.
5. **Non-blocking Unary Calls:** Monolith request handlers use short, explicit boundaries and execute outside ambient database transactions (`@NoDatabaseTransaction()`) with in-memory circuit breaking (5s timeout).

## Development & Testing

```bash
# Run test suite
uv run pytest -v

# Run linter and formatter checks
uv run ruff check .
uv run ruff format --check .

# Auto-fix linting and formatting
uv run ruff check --fix .
uv run ruff format .

# Start local ASGI development server
uv run granian --interface asgi --host 127.0.0.1 --port 5157 --reload src.main:app
```

## Docker Operations

```bash
# Spin up intelligence service with Postgres & Redis dependencies
pnpm docker:intelligence:up

# Tear down intelligence service
pnpm docker:intelligence:down

# Prune or completely remove intelligence layer from the monolith
pnpm prune:intelligence --dry-run
pnpm prune:intelligence --yes
```
