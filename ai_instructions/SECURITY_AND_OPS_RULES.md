# Security and Operations Rules

Environment variables, security, database indexes, logging, and git workflow.

---

## Environment Variables

### Rule
Every environment variable must be validated with Zod at startup. No `process.env.FOO` scattered in code.

### Implementation

Create `apps/api/src/config/env.ts` loading a strictly-typed schema:

```typescript
import { envSchema, type Env } from "@repo/contracts";

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
```

### Rules
- **Schema first**: Define all environment variables in `packages/contracts/src/schemas/env.schema.ts`.
- **Provide safe defaults** for local development (e.g., `PORT: z.coerce.number().default(3000)`).
- **Never hardcode URLs or TTLs**: Dynamically consume `env.CLIENT_URL`, `env.API_URL`, and `env.JWT_EXPIRES_IN`.
- Validate once at startup, use `env` everywhere.
- Never access `process.env` directly outside `config/env.ts`.
- No secrets in code, no secrets in git, no `.env` in version control.

---

## Security

### Secrets
- Never commit secrets, API keys, or passwords.
- Never log secrets.
- Never expose secrets in error messages or API responses.
- Use `.env` for local dev. Use environment injection in CI/CD.
- Rotate secrets if they are ever exposed.

### Authentication
- Use pure JWT from the locked stack.
- Tokens expire. Short-lived access tokens + refresh tokens.
- Access tokens signed with `JWT_SECRET`, refresh tokens with separate `JWT_REFRESH_SECRET`.
- Store tokens in httpOnly cookies (not localStorage). Set `httpOnly: true`, `secure: true`, `sameSite: "strict"`.
- Auth guard reads tokens from both Bearer header and cookies.
- Logout clears cookies on the server via `POST /auth/logout`.
- Never store passwords in plaintext. Hash with argon2.
- Validate auth on every protected route via guard.
- Apply account lockout after configurable failed attempts (default: 5 attempts, 15-minute lockout).
- Use `SecurityModule` (global) for cross-cutting security concerns (rate limiting, WAF, session, lockout).

### Input
- Validate all input with Zod at the API boundary.
- Sanitize HTML output if rendering user content.
- No raw SQL queries from user input.
- Parameterized queries only (Drizzle query builder handles this by default). Never concatenate user input into queries.

### Authorization (Fine-Grained Authorization / FGA)
- **Hybrid FGA Engine**: Enforce access via unified **RBAC + ReBAC + ABAC** evaluation.
- **Action Vocabulary**: Use explicit permission action strings (`notes:create`, `files:upload`, `team:invite`, `billing:manage`).
- **Endpoint Fast-Guard**: Protect HTTP controllers with `@RequirePermission('...')` to reject unauthorized requests at the presentation boundary.
- **Application & Domain Protection**: In CQRS command/query handlers or domain policies, use `AuthorizationService.check({ principal, action, resource, context })` (or `can(...)` for booleans, `assert(...)` to throw `ForbiddenException`), or the `canAccessResource()` helper in `apps/api/src/common/utils/resource-authorization.ts` for owner-aware checks.
- **ReBAC & Ownership**: Resource ownership (`resource.ownerId === principal.id`) grants full author access within the tenant boundary.
- **Tenant Isolation**: Cross-tenant resource access is strictly forbidden (`TENANT_MISMATCH`).
- **Closed-World Default Deny**: Deny by default. Allow only what is explicitly permitted by superadmin, ownership, matching policy, or role.

### Rate Limiting
- Apply rate limiting to public endpoints.
- Apply stricter limits to auth endpoints.
- Use Redis-backed rate limiting for multi-instance safety.

### CORS
- Configure CORS explicitly. Never use `origin: "*"` in production.
- Allowlist specific origins:
  ```typescript
  app.enableCors({
    origin: ["https://app.example.com", "https://admin.example.com"],
    credentials: true,
  });
  ```
- In development, allow `localhost` on standard ports.
- Use `OriginValidationInterceptor` as a defense-in-depth layer beyond CORS.

### Request Limits
- Set maximum request body size (e.g., 1MB for JSON, 10MB for file uploads).
- Set request timeouts (e.g., 30s for API, 60s for file operations).
- Configure at the Fastify adapter level:
  ```typescript
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 1048576, // 1MB
      trustProxy: true,
    }),
  );
  ```

---

## Database Indexing

### When to Add an Index
Add an index when:
- A column is used in filters (`where` clauses) frequently.
- A column is used in `order by` / sort operations.
- A compound query uses multiple columns together.
- Foreign keys / tenant IDs require fast lookups.

### Rules
- Declare indexes in Drizzle schemas (`*.schema.ts`) and generate SQL migrations via `drizzle-kit`.
- Use compound indexes for multi-column queries (`index("idx_name").on(t.tenantId, t.createdAt)`).
- Name indexes descriptively: `users_email_unique`, `orders_tenant_created_at_idx`.

### Anti-Patterns
- No indexes on tiny static lookup tables unless growth is expected.
- No over-indexing. Every index slows write throughput.
- No unused indexes. Monitor query plans with `EXPLAIN ANALYZE`.

---

## Observability, Tracing, and Logging

### OpenTelemetry (Distributed Tracing)
- The monolithic backend exports distributed traces via a side-effect `import "./tracing"` in `apps/api/src/main.ts` (there is no `TracingModule` — tracing boots before the Nest application exists).
- HTTP endpoints and Database queries are automatically instrumented.
- For extremely heavy backend workflows (like large batch processing), wrap the logic in a custom trace span using standard OpenTelemetry SDKs.

### Local Observability Stack (`docker/docker-compose.observability.yml`)
- Single command startup: `pnpm observability:up`.
- **Grafana** (`http://localhost:3001` admin/admin): Pre-configured dashboards for API performance, Postgres, and Redis.
- **Prometheus** (`http://localhost:9090`): Scrapes `/metrics` from Fastify API, Postgres exporter (`:9187`), and Redis exporter (`:9121`).
- **Jaeger** (`http://localhost:16686`): Receives OpenTelemetry OTLP traces (`:4318` HTTP / `:4317` gRPC).
- **Loki** (`http://localhost:3100`) + **Promtail**: Docker log aggregator with automatic `traceId` correlation linking directly into Jaeger waterfalls.

### Standard Application Logging
Tool: Pino (locked stack). Fast, structured, JSON output.

| Level | When | Example |
|-------|------|---------|
| `info` | Important application events | Order placed, payment received |
| `warn` | Recoverable issues | Rate limit hit, retry attempted, deprecated API used |
| `error` | Failures requiring attention | Database connection failed, external API error |
| `debug` | Development troubleshooting | Request/response details |

### Audit Logging (Compliance)
- **Do NOT** use Pino for compliance or security tracking (e.g., password changes, permission grants, data exports).
- Inject the `AuditService` and save structured audit logs directly to the database.
- Audit logs must be immutable and queryable by security teams.

### Rules
- Never log passwords, tokens, or secrets.
- Never log full request bodies for endpoints that handle sensitive data.
- Use structured logging: `logger.info({ userId, action }, "User created")`.
- Log with context: request ID, user ID, correlation ID.
- No `console.log` in production code. Use Pino.

---

## Git Workflow

### Commit Messages
Format: `type(scope): description`

Types:
- `feat` — new feature
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests
- `docs` — documentation only
- `chore` — build, CI, dependencies
- `style` — formatting, no code change

Examples:
```
feat(users): add password reset flow
fix(auth): prevent token reuse after logout
refactor(orders): extract discount calculation
test(users): add integration tests for repository
chore: update dependencies
```

### Rules
- One logical change per commit.
- No WIP commits to main.
- Reference issue numbers when applicable: `fix(auth): handle expired token (#42)`.
- No generated files, build artifacts, or `.env` in commits.

### Branches
- `main` — production-ready, always deployable.
- `feat/[name]` — feature branches.
- `fix/[name]` — bug fix branches.
- Delete branches after merge.

### Pull Requests
- Title matches commit message format.
- Describe what changed and why.
- Link related issues.
- All tests pass.
- At least one review before merge (solo team: self-review checklist).
- No large PRs. Split if >400 lines changed.

---

## Quick Checklist Before Commit

- [ ] No secrets or env vars in code
- [ ] Input validated with Zod
- [ ] Errors return `Result`, not throw
- [ ] Error messages use `I18nService` (not hardcoded)
- [ ] User-facing text uses i18n keys
- [ ] New translation keys added to all locales
- [ ] Logs are structured with Pino
- [ ] New DB fields have indexes (via migration)
- [ ] Commit message follows `type(scope): description`
- [ ] File respects `CODE_QUALITY_RULES.md` limits (one job per file)
- [ ] No `any`, no magic numbers, no console.log
