# File Placement Rules

Where to create new files in this codebase. Every file must land in the correct location on first creation. Moving files later is waste.

---

## Decision Tree

Before creating any file, answer these questions in order:

1. **Is it a shared contract, Zod schema, or DTO?** → `packages/contracts/src/`
2. **Is it authorization rules, permissions, or evaluator?** → `packages/authorization/src/`
3. **Is it translations or locale definitions?** → `packages/i18n/src/`
4. **Is it API client factory/methods?** → `packages/api-client/src/`
5. **Is it transactional email templates?** → `packages/email/src/`
6. **Is it a shared UI primitive, component, hook, or Tailwind token?** → `packages/ui/src/`
7. **Is it a design token (color, radius, font) or generated theme output?** → `packages/design-tokens/` (`src/presets/active.json` is the only hand-edited file; never hand-edit generated outputs)
8. **Is it backend cross-cutting infrastructure?** → `apps/api/src/infrastructure/`
9. **Is it a backend domain module?** → `apps/api/src/modules/[domain]/`
10. **Is it frontend web — route, feature, store, or lib?** → `apps/web/src/`
11. **Is it frontend mobile — screen, feature, store, or lib?** → `apps/mobile/app/` (routes) or `apps/mobile/src/`
12. **Is it config or docs?** → Root level or `docs/`

---

## Root Level Files

| File | When to Create |
|------|---------------|
| `AGENTS.md` | AI agent entry point. Already exists. |
| `turbo.json` | Turborepo pipeline config. Already exists. |
| `pnpm-workspace.yaml` | Workspace definition. Already exists. |
| `tsconfig.base.json` | Shared TypeScript config. Already exists. |
| `docker-compose.yml` | Local dev services. Already in `docker/`. |
| `.gitignore` | Git rules. Already exists. |
| `.npmrc` | pnpm config. Already exists. |
| `README.md` | Project overview. Create only if missing. |

**Never create random config files at root.** They belong in specific packages or apps.

---

## Capability Packages (`packages/*`)

Focused capability packages: `@repo/contracts`, `@repo/authorization`, `@repo/i18n`, `@repo/api-client`, `@repo/email`, `@repo/ui`, `@repo/design-tokens`, `@repo/typescript-config`.

### 1. `@repo/contracts` (`packages/contracts/src/`)
- Schemas (`schemas/*.schema.ts`): Zod 4 schemas & DTOs
- Contracts (`contracts/*.contract.ts`): oRPC route definitions
- Types (`types/*.types.ts`): Request/Response type interfaces
- Constants (`constants/*.ts`): Shared error codes & pagination defaults

### 2. `@repo/authorization` (`packages/authorization/src/`)
- Types (`types.ts`): Principal, ResourceDescriptor, Policy, Decision
- Permissions (`permissions.ts`): Flat action vocabulary (`notes:create`, `privacy:erase:self`) & wildcard resolver
- Evaluator (`evaluator.ts`): Pure FGA engine (RBAC + ReBAC + ABAC)
- Ownership (`ownership.ts`): Resource-owner resolution helpers

### 3. `@repo/i18n` (`packages/i18n/src/`)
- Locales (`locales/*.json`): en.json, es.json, fr.json
- Config (`index.ts`): Locale definitions & keys

### 4. `@repo/email` (`packages/email/src/`)
- Templates (`emails/*.tsx`): React Email transactional templates (welcome, password-reset, invitation, digest)
- Styles (`styles/tokens.ts`): Generated email tokens — never hand-edit (see `@repo/design-tokens`)

### 5. `@repo/ui` (`packages/ui/src/`)
- Primitives (`components/ui/*.tsx`): Base UI + shadcn primitives (button, dialog, card, etc), one family per file (limits in `CODE_QUALITY_RULES.md`)
- Composed (`components/composed/*.tsx`): reusable multi-primitive components (DataTable, PageHeader, EmptyState, ConfirmDialog), one per file
- Styles (`styles/globals.css`): Single Tailwind 4 entry with `@import "tailwindcss"` + design tokens + `@source` for `apps/web` + `packages/ui`
- Hooks (`hooks/*.ts`): Headless helpers (use-mobile)
- Lib (`lib/utils.ts`): `cn()` via `clsx` + `tailwind-merge`
- Config (`components.json`): shadcn registry config (style base-nova, icons lucide, Tailwind 4, aliases `@repo/ui/*`)
- **No business logic. No `fetch`, no Zustand, no i18n. Pure presentational primitives.**

### Rules
- UI primitives are unstyled Base UI (`@base-ui/react`) wrapped with CVA + Tailwind. shadcn CLI adds via `pnpm dlx shadcn@latest add <component> -c apps/web` (lands in `components/ui/`).
- `globals.css` is consumed by web via `import '@repo/ui/globals.css'` in `apps/web/src/routes/__root.tsx` (also imported once per app).

---

### 6. `@repo/design-tokens` (`packages/design-tokens/`)
- Source (`src/presets/active.json`): The single hand-edited token file (colors, radius, fonts, shadows, brand)
- Schema (`src/tokens.schema.ts`): Zod validation for the preset
- Generator (`scripts/generate.ts`): Emits web CSS, email TS, and mobile RN/hex outputs (`pnpm theme:generate`; `pnpm theme:check` guards freshness in CI)

## packages/api-client/

API client factory and helpers.

```
packages/api-client/src/
├── index.ts                   ← createApiClient() factory (shared RefreshCoordinator for 401s)
├── orpc.ts                    ← oRPC OpenAPI-link client factory
├── response.ts                ← error-envelope parsing
├── types.ts                   ← Client-specific types
├── utils.ts                   ← idempotency keys, auth/tenant headers, refresh coordinator
└── subclients/                ← one file per domain (auth, notes, users, files, tenancy, privacy, notifications) + upload.ts (shared presigned-upload orchestrator)
```

### Rules
- Client uses `createApiClient(baseUrl)` pattern.
- No `process.env` at import time.
- Uses the canonical typed oRPC methods from `@repo/api-client`; REST methods are compatibility
  fallbacks. Every oRPC method must have a matching Nest handler and parity/smoke coverage.
- Shared multi-step flows (e.g. `uploadFile`: request → PUT → confirm) live in `subclients/` once and are reused by web and mobile — never duplicated per app.

---

## apps/api/src/

### Config Files

```
apps/api/src/config/
├── env.ts                     ← Environment loader (uses Zod schema from contracts)
```

### Rules
- Only `env.ts` goes here.
- Uses `envSchema.safeParse(process.env)` from `@repo/contracts`.
- Exports validated `env` object.
- Never add `process.env` anywhere else.

---

### Common Files

```
apps/api/src/common/
├── filters/
│   ├── exception.filter.ts    ← Global exception filter
│   └── index.ts
├── guards/
│   ├── auth.guard.ts          ← Authentication guard
│   └── index.ts
├── interceptors/
│   ├── logging.interceptor.ts ← Request/response logging
│   └── index.ts
├── pipes/
│   ├── validation.pipe.ts     ← Zod validation pipe
│   └── index.ts
├── decorators/
│   ├── public.decorator.ts    ← @Public() decorator
│   └── index.ts
├── exceptions/
│   ├── zod-validation.exception.ts ← Zod validation exception
│   └── index.ts
└── utils/
    ├── presentation.utils.ts  ← Result-to-HTTP mapper
    ├── circuit-breaker.ts     ← Circuit breaker pattern
    ├── bulkhead.ts            ← Bulkhead pattern
    └── index.ts
```

### Rules
- Cross-cutting concerns only.
- Must be registered in `app.module.ts` or `main.ts`.
- One concern per file.
- Index files for clean imports.

---

### Infrastructure (Cross-Cutting)

```
apps/api/src/infrastructure/
├── database/
│   ├── database.module.ts     ← Postgres pool & Drizzle client
│   └── database.service.ts
├── logger/
│   ├── logger.module.ts       ← Pino logger
│   ├── logger.service.ts
│   └── logger.module.ts
├── redis/
│   ├── redis.module.ts        ← ioredis connection
│   ├── redis.service.ts
│   └── redis.module.ts
├── queue/
│   ├── queue.module.ts        ← BullMQ root config
│   ├── queue.service.ts
│   └── queue.module.ts
└── workers/
    ├── workers.module.ts      ← Piscina worker pools
    ├── piscina.service.ts
    └── tasks/
        ├── csv-parser.ts      ← Worker task functions
        └── hash.ts
```

### Rules
- Cross-cutting only. Used by multiple modules.
- Must be `@Global()` if used across modules.
- Must use `env` from `config/env.ts`.
- Must implement `OnModuleDestroy` for cleanup.
- No business logic. Pure technical concern.
- Worker tasks are pure functions. No NestJS imports.
- Interactive API Reference setup goes in `infrastructure/api-docs/`.
- Fine-Grained Authorization setup goes in `infrastructure/authorization/`.

---

### Modules

```
apps/api/src/modules/
└── [domain]/
    ├── [domain].module.ts     ← NestJS module definition
    ├── presentation/
    │   ├── [domain].controller.ts
    │   └── index.ts
    ├── application/
    │   ├── commands/           ← Optional: split when 6+ operations
    │   │   ├── create-[domain].ts
    │   │   └── index.ts
    │   ├── queries/            ← Optional: split when 6+ operations
    │   │   ├── get-[domain].ts
    │   │   └── index.ts
    │   └── listeners/          ← Optional: domain event handlers
    │       ├── [domain]-created.listener.ts
    │       └── index.ts
    ├── domain/
    │   ├── entities/
    │   │   ├── [domain].entity.ts
    │   │   ├── [domain].entity.test.ts
    │   │   └── index.ts
    │   ├── value-objects/
    │   │   ├── email.value-object.ts
    │   │   └── index.ts
    │   ├── events/
    │   │   ├── [domain]-created.event.ts
    │   │   └── index.ts
    │   └── errors/
    │       ├── [domain].errors.ts
    │       └── index.ts
    └── infrastructure/
        ├── schemas/
        │   ├── [domain].schema.ts
        │   └── index.ts
        └── [domain].repository.ts
```

### Rules
- Strict CQRS from the first use case: every operation gets its own command/query class under `application/commands/` and `application/queries/` (no flat services, no "start flat" phase).
- Test files co-locate with source: `create-user.command.test.ts` next to `create-user.command.ts`.
- Sub-folders by layer are mandatory (presentation, application, domain, infrastructure).
- Controller is thin: validate → call command/query → map Result to HTTP.
- One module per domain. Don't mix concerns.

---

## Testing Files

### Backend Tests

Co-locate with source:

```
users/
├── commands/
│   ├── create-user.command.ts
│   ├── create-user.command.test.ts        ← Unit test
│   └── create-user.command.integration.test.ts  ← Integration test
├── users.controller.ts
└── users.controller.e2e.test.ts           ← E2E test
```

### Test Naming
- Unit: `[source-file].test.ts`
- Integration: `[source-file].integration.test.ts`
- E2E: `[source-file].e2e.test.ts`

---

## Migration Files

```
migrations/
└── pg/
    ├── 0000_initial.sql       ← single pre-production baseline (schema DDL + RLS + functions + trigger)
    ├── README.md
    └── meta/                  ← _journal.json (single entry) + 0000_snapshot.json
```

### Rules
- Managed via `drizzle-kit` from `drizzle.config.ts`.
- Generate: `pnpm --filter api db:generate`.
- Apply: `pnpm --filter api db:migrate`.
- Check status: `pnpm --filter api db:migrate:status`.
- Verify fresh + upgrade paths: `pnpm --filter api db:migrate:check`.
- `0000_initial.sql` is append-only history in one file while pre-production: schema DDL is generated, hardening SQL (RLS, retention function, audit trigger) is appended by hand. After the first production deploy, add numbered migrations and never edit `0000_initial.sql`.

---

## Frontend Apps

### 6. `apps/web` — TanStack Start (SSR + SPA)

```
apps/web/
├── vite.config.ts              ← tanstackStart() + viteReact() + tailwindcss() + tsConfigPaths()
├── components.json             ← shadcn config (RSC true, style base-nova, Tailwind 4, aliases @/* + @repo/ui)
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── src/
│   ├── router.tsx              ← createRouter() + routeTree + SSR Query integration
│   ├── routeTree.gen.ts        ← Generated by @tanstack/router-plugin (do not hand-edit)
│   ├── routes/               ← thin composers (≤150 lines): validateSearch/beforeLoad/loader/errorComponent + one feature component
│   │   ├── __root.tsx          ← <html>, HeadContent, Scripts, ThemeProvider, QueryProvider, I18nProvider, Toaster
│   │   ├── _app.tsx            ← session bootstrap (auth.me) + guards + AppShell
│   │   ├── _app.dashboard.tsx / _app.notes.index.tsx / _app.notes.new.tsx / _app.notes.$noteId.tsx / _app.notifications.tsx / _app.users.tsx / _app.settings.tsx
│   │   ├── auth.tsx / auth.forgot-password.tsx / auth.reset-password.tsx / accept-invitation.tsx / index.tsx
│   ├── components/
│   │   ├── theme-provider.tsx  ← Light/dark/system via localStorage + matchMedia (d press toggles)
│   │   ├── app-shell.tsx / app-header.tsx (notification bell) / app-sidebar.tsx
│   │   └── error-boundary.tsx  ← RouteErrorFallback for route errorComponent
│   ├── lib/
│   │   ├── env.ts              ← Zod env for VITE_API_URL (import.meta.env)
│   │   ├── api.ts              ← getApiClient(): createApiClient(VITE_API_URL, { getAccessToken, getLocale, getTenantId, onAuthRefreshed/onAuthFailure })
│   │   ├── i18n.tsx            ← initReactI18next with @repo/i18n resources (en/es/fr) + browserLanguageDetector
│   │   ├── query-client.tsx    ← shared getQueryClient() singleton + QueryProvider
│   │   ├── query-keys.ts       ← central key factory (tenant-scoped notes/users/files, user-scoped privacy/notifications)
│   │   └── format.ts           ← locale-aware formatDate/formatDateTime/formatNumber/formatRelativeTime (date-fns)
│   ├── stores/
│   │   ├── auth.store.ts       ← zustand (tokens memory-only; only user profile persists) { accessToken, refreshToken, user }
│   │   ├── locale.store.ts     ← locale (persist)
│   │   └── tenant.store.ts     ← tenantId (persist, sends x-tenant-id)
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   └── use-realtime-notifications.ts ← SSE fan-in invalidating ["notifications"]
│   ├── e2e/
│   │   ├── auth-and-notes.spec.ts ← register → CRUD → logout journey
│   │   ├── guards.spec.ts      ← auth + admin redirect guards
│   │   ├── notifications.spec.ts ← bell → feed → preferences journey
│   │   └── theme.spec.ts       ← light/dark token smoke
│   └── features/
│       ├── auth/               ← auth.mutations.ts + components/(login/register/forgot/reset/password-input/field-error) + hooks/use-auth-success.ts
│       ├── notes/              ← notes.queries.ts + notes.mutations.ts + components/(notes-list/note-create-form/note-detail/notes-table-columns)
│       ├── files/              ← files.queries.ts + files.mutations.ts (XHR progress PUT) + components/(file-drop/attachment-list)
│       ├── notifications/      ← notifications.queries.ts + notifications.mutations.ts + components/(notification-bell/notifications-feed/preferences-card)
│       ├── privacy/            ← privacy.queries.ts + privacy.mutations.ts + components/(export-card/erase-account-card/erase-organization-card)
│       ├── users/              ← users.queries.ts + components/(users-list/users-table-columns/avatar-upload)
│       ├── dashboard/          ← components/(dashboard-header/notes-count-widget/recent-notes-widget)
│       └── tenancy/            ← tenancy.mutations.ts + components/accept-invitation-flow.tsx
```

### Rules
- Routes are **file-based** via TanStack Router. Add via new file in `src/routes/`. `routeTree.gen.ts` is auto-generated.
- Never `fetch` in components directly — use `getApiClient()` and its typed oRPC-backed subclients.
  REST subclients remain compatibility fallbacks while both transports share contracts and parity
  tests.
- Forms: `react-hook-form` + `@hookform/resolvers/zod` + `@repo/contracts` schemas (LoginSchema, RegisterSchema, CreateNoteSchema).
- Auth: Zustand stores `accessToken/refreshToken/user` (persist localStorage). `getApiClient` wires refresh via `requestRefresh` + `onAuthFailure` -> redirect `/auth`.
- Tenant: `useTenantStore.tenantId` automatically sent as `x-tenant-id` via api-client.
- i18n: `useTranslation()` via `react-i18next`; keys from `@repo/i18n` (`common.*`, `auth.*`, `dashboard.*`, `notes.*`). See `I18N_RULES.md`.
- Styling: Use `@repo/ui` components (`Button`, `Card`, `Input`, `Tabs`, `Badge`, etc) + `cn()` + Tailwind 4. No custom CSS libraries beyond Tailwind.

### 7. `apps/mobile` — Expo (native iOS + Android)

```
apps/mobile/
├── app.json                  ← Expo config (name/slug/scheme/plugins; icons in assets/)
├── metro.config.js           ← monorepo Metro: watchFolders=[workspaceRoot] + nodeModulesPaths (app + workspace)
├── babel.config.js           ← presets: babel-preset-expo + nativewind/babel (preset-shaped export goes in presets, not plugins)
├── tailwind.config.js        ← content: app/** + src/** + global.css, preset: nativewind/preset, colors from generated tokens
├── global.css                ← @tailwind base/components/utilities entry (imported once in app/_layout.tsx)
├── nativewind-env.d.ts       ← doctor-managed NativeWind types (do not hand-edit)
├── app/
│   ├── _layout.tsx           ← QueryProvider + ThemeProvider + PushBootstrap + StatusBar + Stack
│   ├── index.tsx             ← auth redirect (login vs tabs)
│   ├── (auth)/               ← login / register / forgot-password / reset-password (route group)
│   ├── (tabs)/               ← index (dashboard) / notes / notifications / users / settings (route group)
│   ├── notes/
│   │   ├── new.tsx           ← create form → detail on success
│   │   └── [id].tsx          ← note detail + attachments
│   └── accept-invitation.tsx ← invitation token flow
├── assets/                   ← icon/splash/adaptive-icon/favicon PNG placeholders (replace with brand art)
└── src/
    ├── lib/
    │   ├── api.ts            ← getApiClient() singleton (same options as web)
    │   ├── env.ts            ← Zod env for EXPO_PUBLIC_API_URL (process.env, inlined at export)
    │   ├── format.ts         ← locale-aware formatting (mirrors web lib/format.ts)
    │   ├── i18n.ts           ← initReactI18next + expo-localization device locale
    │   ├── push.ts           ← Expo push registration, tap-through routing (`resolveNotificationRoute`)
    │   ├── query-client.tsx  ← getQueryClient() singleton, same options as web
    │   ├── query-keys.ts     ← central key factory (mirrors web shapes)
    │   └── secure-storage.ts ← zustand persist storage (SecureStore)
    ├── stores/               ← auth/locale/tenant/theme stores (SecureStore persist)
    ├── theme/                ← theme-provider + generated tokens (never hand-edit generated files)
    ├── test/                 ← setup.ts (native seams mocked once) + native-state.ts + render-hook.tsx
    ├── components/
    │   ├── auth-screen.tsx / push-bootstrap.tsx
    │   └── ui/               ← mirrored RN primitives (same variant/size API as @repo/ui) + file-drop.tsx
    ├── features/             ← auth / files / notes / notifications / privacy / tenancy / users
    │                           (queries.ts + mutations.ts + co-located *.test.ts per module)
    └── nativewind-env.d.ts   ← `declare module "*.css"` for tsc (NativeWind types come from the root file)
```

### Rules
- Screens are **file-based** via expo-router. Add via new file in `app/` (`(auth)` and `(tabs)` are route groups, not URL segments). Keep screens thin; business UI goes in `src/features/[domain]/components/` mirroring web feature names.
- Never import `@repo/ui` components in mobile (DOM-only) — use `src/components/ui/*` mirrors + generated `src/theme` tokens. Never `fetch` outside `src/lib/api.ts` (only exception: presigned-PUT bytes in `features/files/files.mutations.ts`, enforced by `pnpm rules:check`); no raw env outside `src/lib/env.ts`.
- Push: `expo-notifications` (permissions/handlers/badge) + `expo-device` + `expo-constants`; register tokens via `notifications.registerDevice`; tap-through via `resolveNotificationRoute` in `src/lib/push.ts`.
- `pnpm --filter mobile build` runs `expo export --platform ios --platform android` (native only; web already exists as `apps/web`). Verify with `expo export` in CI, not simulators.
- Do not run `expo install --fix` (it fights the monorepo's single-React pnpm overrides); pin versions manually to the Expo SDK set.
- Mobile logic tests live co-located (`*.test.ts`), run under `vitest.config.ts` (node); native seams mocked once in `src/test/setup.ts`. Component tests stay deferred (see `TESTING_RULES.md`).

## Docs

```
docs/                            ← feature guides (living docs)
├── DATABASE.md                 ← Database guide
├── DEVELOPMENT.md              ← Dev setup guide
├── ENVIRONMENT.md              ← Environment variables (api + web)
├── NEW_MODULE.md               ← Module creation guide
├── TENANCY.md                  ← Multi-tenancy architecture
├── FRONTEND.md                 ← Web (TanStack Start) + UI system guide
├── FILE_UPLOADS.md             ← Upload-then-attach pattern + slots + avatar recipe
├── PRIVACY.md                  ← GDPR export & erasure flows
├── PRODUCTION_ARCHITECTURE.md  ← Production baseline (transports, tenancy, workers)
├── PRODUCTION_OPS.md           ← CD, TLS, secrets, backups, alerting, load shedding
└── STARTING_A_NEW_PROJECT.md   ← New-product checklist

Root:
├── ARCHITECTURE.md             ← Architecture manifesto (backend + web wiring)
└── ARCHITECTURE_DEEP_DIVE.md   ← Plain-English guide
```

### Rules
- Docs are living. Update when architecture changes.
- No auto-generated docs in this folder.

---

## Common Mistakes

| Mistake | Correct Location |
|---------|-----------------|
| Zod schema in module folder | `packages/contracts/src/schemas/` |
| Type definition in controller file | `packages/contracts/src/types/` |
| API call with `fetch()` | `packages/api-client` |
| `process.env` outside `config/env.ts` | `config/env.ts` only |
| Business logic in controller | `application/` command/query layer |
| Business logic in repository | `domain/` entity or value object |
| ORM/DB driver in domain layer | `infrastructure/` layer only |
| Test file far from source | Co-locate with source file |
| Utility in random location | `packages/contracts/src/` or nearest `lib/` |
| API Docs in config folder | `infrastructure/api-docs/` |

---

## Quick Reference

| What You're Creating | Where It Goes |
|---------------------|---------------|
| Zod schema | `packages/contracts/src/schemas/[domain].schema.ts` |
| TypeScript type | `packages/contracts/src/types/[domain].types.ts` |
| oRPC contract | `packages/contracts/src/contracts/[domain].contract.ts` |
| Shared constant | `packages/contracts/src/constants/[category].ts` |
| Action permission | `packages/authorization/src/permissions.ts` (flat vocabulary) |
| Pure FGA evaluator | `packages/authorization/src/evaluator.ts` |
| i18n translations | `packages/i18n/src/locales/[locale].json` |
| Email template | `packages/email/src/emails/[Name]Email.tsx` |
| Design tokens | `packages/design-tokens/src/presets/active.json` (only hand-edited file; run `pnpm theme:generate`) |
| UI primitive | `packages/ui/src/components/ui/[name].tsx` |
| Composed component | `packages/ui/src/components/composed/[name].tsx` |
| UI style | `packages/ui/src/styles/globals.css` |
| UI hook | `packages/ui/src/hooks/[name].ts` |
| UI lib | `packages/ui/src/lib/[name].ts` |
| API client helper | `packages/api-client/src/` (subclient per domain in `subclients/`; shared flows like `upload.ts`) |
| Env config | `apps/api/src/config/env.ts` |
| API Docs setup | `apps/api/src/infrastructure/api-docs/` |
| Authorization service | `apps/api/src/infrastructure/authorization/` |
| Domain policies | `apps/api/src/modules/[domain]/application/policies/[domain].policies.ts` |
| Exception filter | `apps/api/src/common/filters/` |
| Auth guard | `apps/api/src/common/guards/` |
| Permissions guard | `apps/api/src/common/guards/permissions.guard.ts` |
| Validation pipe | `apps/api/src/common/pipes/` |
| Database connection | `apps/api/src/infrastructure/database/` |
| Logger | `apps/api/src/infrastructure/logger/` |
| Redis connection | `apps/api/src/infrastructure/redis/` |
| Queue config | `apps/api/src/infrastructure/queue/` |
| Worker pool | `apps/api/src/infrastructure/workers/` |
| Cache service | `apps/api/src/infrastructure/cache/` |
| Storage service | `apps/api/src/infrastructure/storage/` |
| Email service | `apps/api/src/infrastructure/email/` |
| Realtime service | `apps/api/src/infrastructure/realtime/` |
| Session service | `apps/api/src/infrastructure/session/` |
| Health probes | `apps/api/src/infrastructure/health/` |
| Error reporting sink | `apps/api/src/infrastructure/error-reporting/` |
| oRPC adapter runtime | `apps/api/src/infrastructure/orpc/` |
| Rate limiting | `apps/api/src/infrastructure/rate-limit/` |
| WAF middleware | `apps/api/src/infrastructure/waf/` |
| i18n service | `apps/api/src/infrastructure/i18n/` |
| Backend module | `apps/api/src/modules/[domain]/` |
| Module controller | `apps/api/src/modules/[domain]/presentation/` |
| Module Command/Query | `apps/api/src/modules/[domain]/application/` |
| Domain entity | `apps/api/src/modules/[domain]/domain/entities/` |
| Value object | `apps/api/src/modules/[domain]/domain/value-objects/` |
| Domain event | `apps/api/src/modules/[domain]/domain/events/` |
| Domain error | `apps/api/src/modules/[domain]/domain/errors/` |
| Drizzle schema | `apps/api/src/modules/[domain]/infrastructure/schemas/` |
| Repository | `apps/api/src/modules/[domain]/infrastructure/repositories/` |
| Backend unit test | Co-locate with source: `[name].test.ts` |
| Backend integration test | Co-locate with source: `[name].integration.test.ts` |
| Backend E2E test | Co-locate with source: `[name].e2e.test.ts` |
| Web route | `apps/web/src/routes/[name].tsx` (TanStack Router file-based) |
| Web feature | `apps/web/src/features/[domain]/*.ts` (+ `components/` + co-located `*.test.{ts,tsx}`) |
| Web store | `apps/web/src/stores/[name].store.ts` (zustand; tokens memory-only, profile/tenant/locale persisted) |
| Web lib | `apps/web/src/lib/[name].ts` (api.ts, i18n.tsx, query-client.tsx, env.ts) |
| Web component | `apps/web/src/components/[name].tsx` (theme-provider, etc) |
| Web hook | `apps/web/src/hooks/[name].ts` (e.g. `use-realtime-notifications.ts`) |
| Mobile screen | `apps/mobile/app/[route].tsx` (`(auth)`/`(tabs)` groups, `[id].tsx` params) |
| Mobile feature | `apps/mobile/src/features/[domain]/` (queries/mutations + co-located `*.test.ts`) |
| Mobile UI mirror | `apps/mobile/src/components/ui/[name].tsx` (never `@repo/ui`) |
| Mobile push/deep links | `apps/mobile/src/lib/push.ts` + `apps/mobile/src/components/push-bootstrap.tsx` |
| DB migration | `migrations/pg/` |
| Docker config | `docker/` |
| Documentation | `docs/` |

---

## The Rule

**If you're unsure where a file belongs, it probably doesn't belong there.**

Ask:
1. Who uses this file? (One app? Multiple packages? One module?)
2. Does it depend on frameworks or infrastructure?
3. Is it pure data definition or business logic?
4. Does it cross module boundaries?

Then consult this guide. If still unsure, ask before creating.
