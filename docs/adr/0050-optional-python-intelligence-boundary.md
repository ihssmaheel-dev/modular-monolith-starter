# 0050. Optional Python intelligence boundary

## Status

Accepted — 2026-09-16.

## Decision

Provide intelligence as a private, separately deployable FastAPI service under `apps/intelligence`.
Node remains the public API, authorization and tenancy boundary, queue owner, audit owner, and
source of truth. PostgreSQL with pgvector is the first vector backend. The service is disabled by
default and is enabled only by explicit application configuration.

## Why

Model orchestration, embeddings, parsing, and provider SDKs have a different release and runtime
profile from the Node modular monolith. A separate process avoids putting Python or model costs on
applications that do not need intelligence while preserving a small internal boundary for products
that do.

## Consequences

- Normal Node/web/mobile builds do not install Python dependencies or start a model service.
- Internal calls need service credentials, timeouts, retries, circuit breaking, bounded concurrency,
  and end-to-end trace correlation.
- Node must authorize and tenant-scope every request; Python must never query business tables.
- pgvector is a deliberate optional database capability and requires a planned reindex when model
  dimensions change.
- Autonomous actions, tool execution, GPU inference, and provider SDK lock-in remain out of core.
