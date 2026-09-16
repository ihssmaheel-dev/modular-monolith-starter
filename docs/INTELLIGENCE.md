# Optional intelligence layer

The starter includes an optional Python intelligence service without making Python, model
dependencies, GPU infrastructure, or provider costs part of a normal application deployment.
`INTELLIGENCE_ENABLED=false` is the default. The Node API remains the public boundary and the
system of record.

## Responsibilities

The Node module owns user and tenant authorization, idempotency, encrypted run and document
metadata, BullMQ scheduling, audit context, pgvector storage, and public REST/oRPC contracts:

```text
POST /api/v1/intelligence/runs
GET  /api/v1/intelligence/runs/:id
POST /api/v1/intelligence/documents/:fileId/index
GET  /api/v1/intelligence/documents/:id/status
```

The Python service is private and exposes only versioned internal routes:

```text
POST /internal/v1/generations
POST /internal/v1/embeddings
POST /internal/v1/documents/parse
GET  /internal/v1/health/live
GET  /internal/v1/health/ready
GET  /internal/v1/metrics
```

The browser and mobile apps must never receive the internal URL or service credential.

## Layout and local development

`apps/intelligence` is intentionally excluded from `pnpm-workspace.yaml`; its environment is
managed by `uv`:

```text
apps/intelligence/
├── pyproject.toml
├── uv.lock
├── Dockerfile
├── src/intelligence/
│   ├── api/                  # private FastAPI routes and authentication
│   ├── application/         # bounded orchestration and document services
│   ├── config/              # Pydantic settings, disabled by default
│   ├── domain/              # models, ports, stable errors
│   └── infrastructure/      # provider, parser, telemetry, and URL adapters
└── tests/
```

Use `pnpm intelligence:install` and `pnpm intelligence:check` when Python 3.12 and `uv` are
installed. The optional local profile is `pnpm intelligence:up`; it uses the pgvector Postgres
image and publishes the Python service only on loopback (`127.0.0.1:8080`) so a host-run Node API
can reach it. Set the local API's `INTELLIGENCE_SERVICE_URL` to `http://127.0.0.1:8080`. Production
never publishes the Python service on a host port. `pnpm intelligence:down` removes only the
optional service container.

To exercise real provider calls locally, set the required `INTELLIGENCE_*` values in both the API
environment and the Compose environment, then run `pnpm intelligence:up`. Keep the feature disabled
for ordinary development; the profile otherwise starts only a bounded, provider-free health
process.

## Configuration

The Node process requires these values when enabled:

```env
INTELLIGENCE_ENABLED=true
INTELLIGENCE_SERVICE_URL=http://intelligence:8080
INTELLIGENCE_SERVICE_AUDIENCE=modular-monolith-intelligence
INTELLIGENCE_SERVICE_TOKEN_FILE=/run/secrets/intelligence_service_token
INTELLIGENCE_DATA_ENCRYPTION_KEY_FILE=/run/secrets/intelligence_data_key
INTELLIGENCE_PROVIDER=openai-compatible
INTELLIGENCE_MODEL=<model-version>
INTELLIGENCE_EMBEDDING_MODEL=<embedding-model-version>
```

The Python service receives the service credential, provider endpoint, provider key, model names,
and an explicit comma-separated `INTELLIGENCE_ALLOWED_STORAGE_HOSTS` list. Provider keys exist only
in the Python secret store. The API and worker share the same encryption key and service token.

The production PostgreSQL service must have the `vector` extension available before migration
`0004_sleepy_red_ghost.sql` runs. The migration creates tenant-isolated run, document, and chunk
tables and a fixed `vector(1536)` index. Changing embedding dimensions is a deliberate migration
and reindex operation; vectors must never be mixed silently. Local development uses
`docker-compose.intelligence.local.yml`; production uses the immutable-image
`docker-compose.intelligence.prod.yml` overlay.

## Request flow

1. Node authenticates the caller, resolves the tenant, checks `intelligence:run` or
   `intelligence:index`, and creates an encrypted metadata row.
2. BullMQ receives a deterministic job ID. The recovery worker re-enqueues queued rows after a
   process restart or a broker outage.
3. Indexing obtains an authorized short-lived object URL, Python downloads only from an approved
   HTTPS host, parses bounded text input, and returns hashed chunks.
4. Node encrypts chunks, requests embeddings, and persists vectors in PostgreSQL with tenant RLS.
5. A run embeds its prompt, retrieves only the requested document IDs for the current tenant, and
   sends those authorized chunks to Python. The result, citations, usage, and model version are
   encrypted or persisted as metadata on Node.
6. The provider adapter uses deterministic temperature, timeouts, bounded exponential retries, a
   circuit breaker, and a concurrency semaphore. Provider output is untrusted and structured
   output is rejected unless it is valid JSON.

No autonomous tools, arbitrary URL fetches, arbitrary Python execution, or automatic model
downloads are included. A future action-taking agent requires a separate permission, idempotency
contract, audit record, and human approval workflow.

## Security and privacy

- Internal requests require a bearer service credential and exact audience header. Rotate both
  together through the secret manager; deployments that need per-request expiry should put a
  short-lived mTLS or signed-token proxy in front of the private service.
- Prompts, document chunks, and responses are encrypted by Node before persistence. Raw content is
  absent from structured logs by default.
- RLS plus repository checks enforce tenant and subject isolation. Run output is visible only to the
  requesting user; document indexing is tenant-scoped.
- Request bytes, document bytes, context items, chunks, and output tokens are bounded. Signed URL
  redirects are disabled and host allowlists prevent SSRF.
- Real provider calls are never part of normal CI. Tests use fakes and fixed JSON fixtures.
- Retention, export, legal holds, and tenant-specific prompt retention policies remain application
  decisions. The starter keeps only encrypted data and operational metadata by default.

## Operations, cost, and observability

The service is CPU-only and independently scalable. Do not add a GPU or model server to the default
image. Hosted providers are the default; self-hosted vLLM is an explicit private-network profile.
Set resource and PID limits, keep the service off the public network, and use immutable image
references in staging and production. `pnpm intelligence:prod:up` also mounts the optional
Prometheus target and service credential so the private Python metrics endpoint is scraped only
when this profile is deliberately enabled.

The existing Grafana/Prometheus/Loki/Tempo stack receives the `Intelligence` dashboard category.
Metrics use operation/outcome/model labels only; tenant IDs, prompts, documents, and responses are
never labels. The included dashboard monitors request latency/errors, provider failures and circuit
state, active concurrency, queue depth and oldest age, token usage, estimated cost, memory, and CPU.
Embedding caching, retrieval-quality metrics, model fallback counters, and per-tenant budgets remain
product-level extensions; add their bounded metrics when a product enables those capabilities. The
foundation's hard request, document, context, concurrency, and output ceilings remain in force first.

## Provider adapter guide

Implement `ModelGateway` and keep the HTTP contract OpenAI-compatible. Add a provider-specific
adapter only when a product needs behavior the compatibility endpoint cannot provide. Every adapter
must preserve timeouts, retry bounds, circuit state metrics, response validation, and redaction.
Provider SDKs are not core dependencies.

## RAG reindexing and versioning

The parser version, embedding model, model name, and content hash are stored with every document or
run. A model or parser change creates a new reindex job; it must not overwrite vectors with a
different dimension. Roll out a reindex in bounded batches, observe queue age and provider error
rates, and keep the previous model until all consumers have moved. Prompt changes are versioned by
the application module and recorded alongside the run.
