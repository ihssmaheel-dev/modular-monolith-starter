# Optional Python intelligence rules

The Python service under `apps/intelligence` is an optional, separately deployed capability. It is
not a pnpm workspace package and must not be imported by the Node API, web app, or mobile app.

## Boundary

- Node remains the public API, authentication and authorization boundary, tenant boundary, queue
  owner, audit owner, and source of truth for business data and vectors.
- Python only performs provider calls, embedding generation, bounded document parsing, chunking, and
  output validation through typed Pydantic models.
- Python never connects to PostgreSQL, Redis, object storage credentials, or business tables.
- Browser and mobile clients never call Python. The Node module calls private Python routes with an
  audience-bound service credential that is rotated through the deployment secret manager.

## Required engineering rules

- Python 3.12, `uv`, and a committed `uv.lock` are mandatory.
- Ruff, Pyright strict mode, and pytest must pass through `pnpm intelligence:check`.
- Keep provider adapters behind `domain/ports`; do not add LangChain, Celery, Ray, Torch,
  Transformers, autonomous tool execution, or arbitrary code execution to the foundation.
- Validate every request and response with Pydantic. Reject unknown fields at the internal boundary.
- Never log prompts, retrieved content, model responses, provider keys, access tokens, or tenant IDs.
- Use bounded timeouts, retries, circuit breaking, concurrency semaphores, request bytes, document
  bytes, context count, chunk count, and output-token limits.
- Only approved HTTPS object-storage hosts may be fetched. Redirects are disabled.
- Propagate OpenTelemetry context and expose only bounded-cardinality Prometheus metrics.
- Add provider and parser tests before adding a new adapter or file format.

## Delivery

The service is disabled by default. Node and normal application builds must remain usable when
Python and `uv` are absent. Enable it explicitly with `INTELLIGENCE_ENABLED=true`, provision
pgvector, configure the service credential and provider, then run the intelligence Compose profile.
