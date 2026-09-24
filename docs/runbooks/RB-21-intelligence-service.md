# RB-21: Python Intelligence Layer Service Failure & Degradation

- **Severity:** SEV-2 (AI features degraded; core monolithic apps continue unaffected)
- **Owner:** Backend / AI Platform Engineering
- **Last reviewed:** 2026-09-24

## How you notice

- **Alerts:** `IntelligenceServiceDegraded`, `IntelligenceCircuitBreakerTripped`
- **Dashboard:** Grafana -> Async Pipelines / Service Mesh -> Intelligence Service
- **User reports:** AI assistant responses fail with 503 (`intelligence.errors.unavailable`) or timeout errors.

## Blast radius

- **Degraded:** `/api/v1/intelligence/chat` (unary chat) and `/api/v1/intelligence/search` (hybrid RAG search).
- **Unaffected:** Authentication, Users, Tenancy, Notes, File uploads/downloads, Email delivery, and Background Workers.
- **Safety guarantee:** Monolith HTTP handlers operate outside database transactions (`@NoDatabaseTransaction()`) and fail fast with an in-memory circuit breaker, preventing socket exhaustion.

## Triage in 5 minutes

1. Check intelligence service process liveness:

   ```bash
   curl -I http://127.0.0.1:5157/health/live
   ```

   _Healthy:_ `HTTP/1.1 200 OK` with body `{"status": "ok"}`.

2. Check database readiness and FastEmbed model status:

   ```bash
   curl -s http://127.0.0.1:5157/health/ready
   ```

   _Healthy:_ `HTTP/1.1 200 OK` with `{"status": "ready", "database": "ok", "embedding_model": "BAAI/bge-small-en-v1.5"}`.

3. Inspect intelligence service logs:

   ```bash
   docker logs --tail 100 -f monorepo-intelligence
   ```

   Look for upstream provider timeouts, invalid HMAC signatures, or database connectivity drops.

4. Verify circuit breaker state in NestJS API:
   ```bash
   # Filter logs for gateway circuit breaker messages
   docker logs monorepo-api 2>&1 | grep "Intelligence circuit breaker"
   ```

## Fix paths

### Path 1: Graceful runtime degradation (safest, 30 seconds)

If the intelligence service or upstream LLM provider is down, disable intelligence in the API Gateway. The application will cleanly return translated `AI_DISABLED` errors without making network requests.

```bash
# In apps/api/.env
INTELLIGENCE_ENABLED=false
# Or run helper script
pnpm prune:intelligence --disable
```

_Rollback:_ Set `INTELLIGENCE_ENABLED=true` once upstream issues resolve.

### Path 2: Restart intelligence service container (1 minute)

If the Python process crashed or memory spiked due to model compilation:

```bash
pnpm docker:intelligence:down
pnpm docker:intelligence:up
```

_Verify:_ Run `curl http://127.0.0.1:5157/health/live`.

### Path 3: Upstream LLM key / Egress allowlist issue (3 minutes)

If logs report `AuthenticationError` or `ConnectionRefused`:

1. Verify `OPENAI_API_KEY` (or provider key) is valid and unexpired.
2. Confirm outbound HTTPS connectivity to `api.openai.com` / `api.anthropic.com` from the container.
3. Check `EGRESS_ALLOWLIST` in `services/intelligence/src/config.py`.

### Path 4: Embedding model blue/green parallel-flip (offline)

To migrate or re-embed documents without downtime:

1. Bump `EMBEDDING_MODEL_VERSION` in `services/intelligence/src/config.py` (e.g., from `v1` to `v2`).
2. Run reindexing batch worker to write new embeddings to `intelligence.document_embeddings` under `model_version = 'v2'`.
3. Flip the gateway query version flag to `v2`.
4. Prune old records where `model_version = 'v1'`.

## Verify

Execute a test unary chat completion via the API Gateway:

```bash
curl -X POST http://127.0.0.1:5156/api/v1/intelligence/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -d '{"messages": [{"role": "user", "content": "Ping"}]}'
```

_Expected output:_ `HTTP 200 OK` with JSON `{ "content": "...", "model": "..." }`.

## Escalate when

- PII redaction engine failure or unredacted credentials detected in egress logs (immediate security escalation).
- Persistent upstream provider billing or rate-limit lockouts affecting multiple tenants.
- Database connection pool exhaustion within the `intelligence.*` schema.

## After

- [ ] Check if alert thresholds for `IntelligenceServiceDegraded` need tuning.
- [ ] Review token usage ledgers in `intelligence.usage_ledgers` for anomalous spikes.
- [ ] Confirm no upstream data retention was enabled during the incident.
