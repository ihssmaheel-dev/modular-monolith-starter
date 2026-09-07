# AI Instructions

**ALL RULES ARE MANDATORY. VIOLATIONS ARE PROHIBITED.**

Before any code change, read these files in order:

| # | File | Purpose |
|---|------|---------|
| 1 | [CORE_RULES.md](./CORE_RULES.md) | Supreme laws. Never/always. |
| 2 | [MODULE_RULES.md](./MODULE_RULES.md) | Backend module structure. |
| 3 | [FILE_PLACEMENT_RULES.md](./FILE_PLACEMENT_RULES.md) | Where files go. |
| 4 | [EVENT_AND_ERROR_RULES.md](./EVENT_AND_ERROR_RULES.md) | neverthrow Result + domain events. |
| 5 | [I18N_RULES.md](./I18N_RULES.md) | Translations, locale management. |
| 6 | [FRONTEND_RULES.md](./FRONTEND_RULES.md) | Web (TanStack Start) + UI system. |
| 7 | [CODE_QUALITY_RULES.md](./CODE_QUALITY_RULES.md) | File sizes, naming, anti-patterns. |
| 8 | [SECURITY_AND_OPS_RULES.md](./SECURITY_AND_OPS_RULES.md) | Env vars, security, logging. |
| 9 | [TESTING_RULES.md](./TESTING_RULES.md) | Unit/integration/E2E contract. |
| 10 | [PACKAGE_POLICY.md](./PACKAGE_POLICY.md) | Adding dependencies. |
| 11 | [PERFORMANCE_RULES.md](./PERFORMANCE_RULES.md) | DB queries, caching, backend performance. |

## Canonical runtime decisions

- oRPC is the canonical runtime transport under `/api/v1/rpc`; REST controllers are the compatibility transport under `/api/v1`. Both delegate to the same application commands/queries, and every route requires parity/smoke tests.
- `TENANCY_MODE` is deployment-scoped (`single` or `multi`) and cannot be selected by clients.
- Critical side effects use the transactional outbox; in-process events are only for non-critical local notifications.
- Every API input/output is Zod validated, every error has a stable code plus i18n key, and tenant-scoped cache keys include tenant ID.
- A single React and `@types/react` version is enforced by root pnpm overrides.

## Before Every Task

1. Read the rules above.
2. Follow them exactly.
3. Run `pnpm rules:check` before committing.
4. If uncertain, ask before proceeding.

## Violation Policy

- All rules are **mandatory** and **non-negotiable**.
- Code that violates rules will be **rejected**.
- Automated checks run via `pnpm rules:check`.
