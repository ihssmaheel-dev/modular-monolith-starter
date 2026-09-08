# Testing Rules

Test contract for the codebase. Quality without ceremony.

---

## Test Layers

| Code Location | Test Type | Tool | What to Test |
|---------------|-----------|------|--------------|
| `domain/` | Unit | Vitest | Entities, value objects, business rules. Pure logic. |
| `application/` | Unit | Vitest | Use cases, service logic. Mock repository. |
| `infrastructure/` | Integration | Vitest + real Postgres/Redis (testcontainers or local docker) | Repositories, adapters. Real Postgres/Redis. |
| `presentation/` + full flows | E2E | Supertest (API), Playwright (web) | API endpoints, user journeys. |
| `apps/web/src/**` | Unit | Vitest + Testing Library (jsdom) | Query/mutation option builders, lib, stores, hooks, components. Mock `getApiClient()`. |
| `apps/mobile/src/**` (logic) | Unit | Vitest (node) | Query/mutation option builders, lib, stores. Mock `getApiClient()` + native modules. |

---

## Rules

### Unit Tests (domain + application)
- Run without NestJS, database, or network.
- Mock repository and external dependencies.
- Test business rules in isolation.
- Fast. Should complete in milliseconds.
- One test file per source file, co-located next to it.

### Unit Tests (web frontend)
- Run under `apps/web/vitest.config.ts` (jsdom, globals). Never hit the network.
- Mock `@/lib/api` (`getApiClient`) and external transports (`uploadFile`, `EventSource`).
- One test file per source file, co-located next to it (`*.test.{ts,tsx}`).
- Every `src/features/*/*.{queries,mutations}.ts` module has a co-located test (enforced by `pnpm rules:check`).
- Prefer `renderWithProviders` (Query client + i18n); use `renderWithApp` (memory router) only for components that need `Link`/`useNavigate`.
- Assert translated output (interpolated strings, never raw keys), loading/error/empty tri-states, disabled-while-pending, and per-status error keys.

### Unit Tests (mobile logic)
- Run under `apps/mobile/vitest.config.ts` (node, globals). Never hit the network or native modules.
- Native seams are mocked once in `src/test/setup.ts` (`expo-secure-store`, `expo-notifications`, `expo-device`, `expo-constants`, `expo-localization`, `expo-file-system`, `react-native`); tests drive them through `src/test/native-state.ts`, never by re-mocking.
- Mock `@/lib/api` (`getApiClient`) and `uploadFile`; stub global `fetch` only for the presigned-PUT path (`putBytesNative`).
- One test file per source file, co-located next to it (`*.test.ts`).
- Every `src/features/*/*.{queries,mutations}.ts` module has a co-located test (enforced by `pnpm rules:check`).
- Hooks run headless via `src/test/render-hook.tsx` (react-test-renderer + fresh QueryClient per test).
- Coverage excludes the presentational layer (`src/components/**`, `src/features/**/components/**`, `src/theme/**`) until the component runner lands (deferred: needs architecture review per `PACKAGE_POLICY.md`).

### Integration Tests (infrastructure)
- Use real PostgreSQL and Redis (via testcontainers or local docker).
- Test repository CRUD, query correctness, data mapping.
- Clean up data between tests.
- Run in CI with docker services.

### E2E Tests (presentation + flows)
- Test complete user journeys through the API.
- Use Supertest for API tests.
- Use Playwright for web browser tests.
- Cover critical paths only: registration, login, core CRUD, payments.

---

## Vitest Configuration

Create `vitest.config.ts` in `apps/api/`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/*.e2e.test.ts", "**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

For integration tests, create `vitest.integration.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 30000,
  },
});
```

---

## Mock Patterns

### Mocking Repositories

Use `vi.fn()` with typed interfaces:

```typescript
import { vi } from "vitest";
import { UsersRepository } from "../infrastructure/users.repository";

const mockRepository = {
  findByEmail: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
} as unknown as UsersRepository;
```

### When to Mock vs Real

| Situation | Approach |
|-----------|----------|
| Unit testing a service | Mock the repository |
| Unit testing domain logic | No mocks needed (pure functions) |
| Integration testing a repository | Real database (testcontainers) |
| E2E testing an API | Real everything (Supertest + Docker) |

### Test Data Factories

For complex domain objects, create factory functions:

```typescript
// test/factories/user.factory.ts
import { User } from "../domain/entities/user.entity";

export function buildUser(overrides?: Partial<{ email: string; name: string }>): User {
  return User.create({
    email: overrides?.email ?? "test@example.com",
    name: overrides?.name ?? "Test User",
  });
}
```

Use factories instead of inline fixtures when:
- The same object is created in 3+ tests
- The object has many required fields
- You need different variations (admin, banned, etc.)

---

## File Naming

```
users.service.test.ts          # Unit test for users.service.ts (co-located)
users.repository.integration.test.ts  # Integration test
users.e2e.test.ts              # E2E test for user-related API endpoints
```

Place unit test files next to the source file they test.

---

## Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("UsersService", () => {
  describe("create", () => {
    it("should create a user when email is available", async () => {
      // Arrange
      // Act
      // Assert
    });

    it("should return EMAIL_TAKEN when email already exists", async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

- Use `describe` for the module/class.
- Use `describe` for the method.
- Use `it` for individual behavior.
- Each test has exactly one assertion concept.
- Arrange → Act → Assert pattern.

---

## What NOT to Test

- Framework internals (NestJS, Drizzle ORM, React).
- Third-party library behavior.
- Trivial getters/setters.
- Type-only code.
- Configuration files.

---

## Coverage Expectations

- Domain layer: high coverage (this is the core).
- Application layer: high coverage.
- Infrastructure layer: medium coverage (integration tests matter more).
- Presentation layer: medium coverage (E2E tests matter more).
- Overall: aim for meaningful coverage, not percentage targets.

---

## CI Integration

- Unit tests run on every push.
- Integration tests run on every push (with docker services).
- E2E tests run on PRs and before merge.
- All tests must pass before merge.
- No skipped tests without a linked issue.

---

## Test Scripts

```json
{
  "test": "vitest run",
  "test:unit": "vitest run --config vitest.config.ts",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "test:e2e": "vitest run --config vitest.e2e.config.ts",
  "test:watch": "vitest watch"
}
```

**Note:** each layer has its own config (`vitest.config.ts`, `vitest.integration.config.ts`, `vitest.e2e.config.ts`). Always pass `--config` explicitly instead of `--dir` or `--include`.
