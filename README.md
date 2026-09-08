# Modular Monolith Architecture

A production-grade, highly scalable TypeScript modular monolith architecture designed for enterprise-ready applications. Built with NestJS, Fastify, PostgreSQL, Drizzle ORM, a runtime oRPC transport with REST compatibility, fine-grained authorization, a transactional outbox, distributed caching, and full local observability.

---

## Tech Stack

- **Backend:** NestJS 11 + Fastify 5 + PostgreSQL 16 + Drizzle ORM + Redis 7 + BullMQ + oRPC + Scalar
- **Frontend Web:** TanStack Start 1 (Vite 8 + TanStack Router file-based SSR + streaming) + TanStack Query 5 + Zustand 5 + react-i18next + Tailwind 4 + shadcn base-nova + Base UI 1
- **Capability Packages:**
  - `@repo/contracts`: Zod 4 schemas, oRPC type-safe API contracts, DTO types, pagination & error constants, env schemas (API + VITE_*)
  - `@repo/authorization`: Fine-Grained Authorization engine (RBAC + ReBAC + ABAC) & action vocabulary
  - `@repo/i18n`: Multi-language JSON locale dictionaries (en, es, fr) & locale resolver (I18nService + react-i18next)
  - `@repo/api-client`: Type-safe oRPC client factory (OpenAPI link) with REST compatibility fallback, auto-refresh, tenant + locale + CSRF + idempotency
  - `@repo/ui`: Base UI React 1 + shadcn base-nova + Tailwind 4 + tw-animate-css + CVA + lucide-react (single `globals.css` + `cn()`)
  - `@repo/email`: React Email templates with isolated HTML renderer
  - `@repo/typescript-config`: Centralized TypeScript configurations (TS ~6)
- **Observability:** Grafana + Prometheus + Loki + Promtail + Jaeger + Postgres & Redis Exporters
- **Documentation:** Interactive Scalar API Reference (`@scalar/fastify-api-reference`) & OpenAPI 3.1
- **Tooling & Monorepo:** Turborepo 2.10 + pnpm 10 workspaces + TypeScript ~6 + Vitest 5 (api) + Playwright (web)

---

## Prerequisites

- **Node.js**: `>= 20.19.0` (required for the CommonJS API build to load oRPC's ESM runtime)
- **pnpm**: `10.34.5` (`corepack enable` then `corepack prepare pnpm@10.34.5 --activate`)
- **Docker**: Docker Engine with Docker Compose v2.17+

---

## Quick Start

```bash
# 1. Install dependencies, configure env, start core services, migrate & seed DB, and build
pnpm bootstrap

# 2. Start API in development mode
pnpm dev
```

---

## Project Structure

```text
├── apps/
│   ├── api/             # NestJS Fastify backend (Modular Monolith + CQRS + FGA + Drizzle)
│   ├── web/             # TanStack Start web (Vite 8 + Router file-based SSR + Query + Zustand + i18n + @repo/ui)
│   ├── mobile/          # Expo native app (expo-router file-based + Query + NativeWind, @repo/contracts + i18n)
├── packages/
│   ├── contracts/       # Zod 4 Schemas, oRPC API contracts, DTO types, constants, env schemas
│   ├── authorization/   # Pure FGA Evaluator (RBAC + ReBAC + ABAC) & Action Vocabulary
│   ├── i18n/            # Multi-language locale dictionaries (en, es, fr) & config, react-i18next resources
│   ├── api-client/      # Type-safe oRPC client + REST compatibility (auto-refresh + CSRF + tenant + locale + idempotency)
│   ├── ui/              # Base UI + shadcn base-nova + Tailwind 4 (globals.css, components, hooks, lib)
│   ├── design-tokens/   # Single token source (active.json → generated web/email/mobile themes)
│   ├── email/           # Email templates (React Email)
│   └── typescript-config/ # Base TypeScript configurations
├── scripts/             # Full-Stack Vertical Slice Generator (pnpm generate:feature)
├── docker/              # Docker Compose services & Observability configuration
└── ai_instructions/     # Architectural laws & guidelines (CORE, FILE_PLACEMENT, FRONTEND, I18N, etc)
```

---

## Available Scripts

### Development & API

```bash
pnpm dev              # Start all (api + web) in development mode (Turborepo)
pnpm dev:api          # Build dependencies and start API (http://localhost:3000)
pnpm dev:api:debug    # Start API with Node inspector on port 9229
pnpm dev:web          # Create web env if needed, build dependencies, and start web (http://localhost:5173)
pnpm dev:mobile       # Create mobile env if needed, build dependencies, and start Expo
pnpm --filter web build # Build the production SSR web bundle
pnpm --filter web start # Run the built SSR web bundle
```

### Full-Stack Vertical Slice Generator

```bash
# Automatically wires contracts, REST + oRPC, API client, backend module, web slice, and mobile slice
pnpm generate:feature <module> <feature>
```

### Build & Verification

```bash
pnpm build            # Build all packages & apps with Turborepo (API + web SSR)
pnpm lint             # Lint all workspaces (eslint)
pnpm format           # Format code with Prettier
pnpm format:check     # Check formatting
pnpm typecheck        # Run TypeScript type check across all workspaces (api, web, ui, contracts ...)
pnpm rules:check      # Enforce strict architectural boundaries and dependency rules
pnpm test:generator   # Verify the full-stack feature generator remains compilable

# Web shadcn
pnpm dlx shadcn@latest add button -c apps/web   # add ui primitive to @repo/ui (see packages/ui)

pnpm --filter web typecheck
```

### Testing

```bash
pnpm test             # Run test suite
pnpm test:unit        # Run unit tests across all packages
pnpm test:integration # Run repository & database integration tests
pnpm test:e2e         # Run end-to-end tests
pnpm test:api:watch   # Run API unit tests in watch mode
```

### Database & Migrations (PostgreSQL + Drizzle ORM)

```bash
pnpm db:generate      # Generate SQL migrations from Drizzle schemas
pnpm db:migrate       # Apply pending migrations to PostgreSQL
pnpm db:migrate:status # Inspect migration status
pnpm db:migrate:dev   # Push schema changes directly during development
pnpm db:seed          # Seed database with initial development data
pnpm db:studio        # Open Drizzle Studio database viewer
```

### Docker & Infrastructure

```bash
pnpm docker:up        # Start PostgreSQL, Redis, MinIO, Mailpit, pgAdmin
pnpm docker:down      # Stop core infrastructure
pnpm docker:logs      # View infrastructure logs
```

### Local Observability Stack (One-Command)

```bash
pnpm observability:up   # Start Grafana, Prometheus, Loki, Promtail, Jaeger, Exporters
pnpm observability:down # Stop observability stack
pnpm observability:logs # Tail telemetry logs
```

---

## Local Service Directory

| Service                  | Local URL / Port                 | Credentials / Purpose                              |
| :----------------------- | :------------------------------- | :------------------------------------------------- |
| **API Backend**          | `http://localhost:3000`          | Fastify API Server (`/api/v1`, `/api/v1/health/*`) |
| **Web (TanStack Start)** | `http://localhost:5173`          | Vite + SSR (dev) `pnpm --filter web dev`           |
| **Scalar API Reference** | `http://localhost:3000/api/docs` | Interactive OpenAPI 3.1 Docs                       |
| **Grafana Dashboard**    | `http://localhost:3001`          | `admin / admin` (API, DB, Redis metrics)           |
| **Jaeger Trace Viewer**  | `http://localhost:16686`         | OpenTelemetry Distributed Traces                   |
| **Prometheus Metrics**   | `http://localhost:9090`          | Time-series Metrics Server                         |
| **Loki Log Engine**      | `http://localhost:3100`          | High-performance Log Aggregator                    |
| **Mailpit Web UI**       | `http://localhost:8025`          | Local SMTP Email Inbox (`:1025`)                   |
| **MinIO Console**        | `http://localhost:9001`          | `minioadmin / minioadmin` (S3: `:9000`)            |
| **pgAdmin 4**            | `http://localhost:5050`          | `admin@example.com / admin`                        |

---

## Key Architectural Patterns

### 1. Clean Architecture & CQRS (Backend) + Shared Contracts (Full-Stack)

Every domain module in `apps/api/src/modules/[domain]/` adheres to CQRS:

- **`presentation/`**: Thin Fastify controllers mapping input/output via `@repo/contracts` (`ZodValidationPipe` + `handleResult` + `I18nService`).
- **`application/`**: Single-responsibility `commands/`, `queries/`, and domain event `listeners/`. All return `neverthrow` `Result<T, E>`.
- **`domain/`**: Pure `entities/`, `value-objects/`, `events/`, and domain `errors/` (zero framework deps).
- **`infrastructure/`**: Drizzle table schemas and repositories (`BaseRepository`/`TenantScopedRepository` + `DatabaseService` + `TenantContextService`).

The web client (`apps/web`, TanStack Start) consumes the same schemas/contracts as the API via `react-hook-form` + `zodResolver` + `getApiClient()` (`@repo/api-client`). Its subclients use the live oRPC OpenAPI transport by default, with REST compatibility available during migrations. One source of truth — compiler catches drift.

### 2. Frontend — TanStack Start (Web) + `@repo/ui`

- **Web:** Thin file-based TanStack Router routes (`__root.tsx`, `_app*.tsx`, `auth*.tsx`, `accept-invitation.tsx`) composing feature components from `src/features/[domain]/components/`, `src/router.tsx` + SSR query integration (shared `getQueryClient()`), Zustand persist (localStorage) + TanStack Query with tenant-scoped keys (`src/lib/query-keys.ts`), react-i18next (`src/lib/i18n.tsx`), Tailwind 4 + `@repo/ui` (Base UI + shadcn base-nova + lucide), `src/lib/api.ts` singleton with 401 refresh + tenant + locale + idempotency-key, `src/lib/env.ts` `VITE_API_URL`, locale-aware `src/lib/format.ts` (`date-fns`).
- **UI:** `packages/ui` single `globals.css` + CVA + `cn()`; primitives in `components/ui/`, reusable `DataTable`/`PageHeader`/`EmptyState`/`ConfirmDialog` in `components/composed/`; shadcn CLI `pnpm dlx shadcn@latest add <c> -c apps/web` writes to `packages/ui/src/components/ui`.

### 3. Fine-Grained Authorization (FGA)

Unified **RBAC + ReBAC + ABAC** engine:

- **Action Vocabulary**: Granular permissions (e.g., `notes:create`, `team:invite`, `privacy:erase:self`).
- **Relationship-Based Access Control**: Resource ownership (`resource.ownerId === principal.id`).
- **Attribute-Based Access Control**: Dynamic policy predicates (tenant scoping, department matching).
- **Backend Protection**: Controller `@RequirePermission('notes:create')` and application `AuthorizationService.check(...)`.

### 4. Transactional Outbox & Resilient Async Events

- **Guaranteed Event Publishing**: Changes to domain entities and their outgoing domain events are written in the same PostgreSQL transaction.
- **Background Outbox Relay**: An asynchronous worker polls PostgreSQL with `FOR UPDATE SKIP LOCKED`, publishes in-process domain events, retries with exponential backoff, and moves exhausted events to a replayable dead-letter state.

### 5. Zero-Trust Multi-Tenancy

- **Dynamic Mode**: Supports both single-tenant and cloud multi-tenant execution modes via `TENANCY_MODE`.
- **Tenant Context Isolation**: `TenantContextGuard` and `TenantScopedRepository` enforce row-level tenant boundary isolation automatically across all database operations.

### 6. Production operating model

- One deployable modular API and one SSR web image; modules remain independently testable without prematurely splitting into services.
- Every HTTP request runs inside a bounded transaction unless it is a long-lived stream; background jobs use explicit system scope.
- PostgreSQL RLS is defense in depth for tenant-owned tables, while application authorization remains the source of business decisions.
- Access tokens stay in memory in the web client; refresh tokens are `HttpOnly`, `Secure`, `SameSite=Strict` cookies and rotate on use.
- Migrations are journaled, locked, and applied before the API starts; images run as non-root users with health checks.

For a new product or module, follow [Starting a New Project](docs/STARTING_A_NEW_PROJECT.md).
For delivery, TLS, secrets, alerting, backups, and load shedding, follow [Production Ops](docs/PRODUCTION_OPS.md).

---

## Health Checks

- **Liveness:** `GET /api/v1/health/live`
- **Readiness:** `GET /api/v1/health/ready`
- **Prometheus Metrics:** `GET /metrics`

---

## License

MIT
