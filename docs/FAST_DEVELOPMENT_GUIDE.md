# Fast Development Guide: Inner Loop vs. Outer CI Loop

This guide documents the high-velocity inner development loop and how it integrates with full architectural gates in outer CI.

---

## 1. Velocity Architecture Overview

Building features in this architecture does not require waiting for full 15-pass global static analysis or full 180-test monorepo suites on every change.

The workflow is split into two complementary loops:

- **Inner Feedback Loop (Sub-Second to 2 Seconds)**: Fast-path validation on modified files, parallel pure CQRS testing, and automated feature scaffolding.
- **Outer Release Gate (CI / Pre-Push)**: Comprehensive 10-point release verification (`pnpm test:release`) protecting production invariants.

---

## 2. Inner Development Loop (Fast Path)

### Step 1: Zero-Tax Feature Scaffolding

To generate a new feature slice with all required contracts, CQRS handlers, error maps, deny-by-default FGA stubs, and 3-locale i18n keys:

```sh
# Generate backend vertical slice only (Contracts + CQRS + Infra + REST/oRPC + i18n + Policies)
pnpm generate:feature <module> <feature> --access=tenant-shared --minimal

# Or full-stack slice with web frontend:
pnpm generate:feature <module> <feature> --access=tenant-shared --skip-mobile
```

What the generator provides out of the box:

1. **Domain Layer**: Entity, events, and typed error union (`domain/errors/<feature>.errors.ts`).
2. **Infrastructure**: Drizzle schema and `BaseRepository` implementation with `findById`/`updateById`/`paginate`.
3. **Application**: CQRS Commands and Queries with pre-written Vitest unit tests.
4. **FGA Policy Stubs**: Deny-by-default stubs in `application/policies/<feature>.policies.ts`.
5. **Contracts**: `@repo/contracts` Zod schemas and oRPC contract.
6. **API Client**: `@repo/api-client` subclient.
7. **Presentation**: REST controller, oRPC controller, DTO mapper, HTTP error-map, and route parity test (`parity.test.ts`).
8. **i18n Synchronization**: Translation keys auto-injected into `en.json`, `es.json`, and `fr.json`.

### Step 2: Instant Rule Checking (< 200ms)

Validate your changes against architecture rules (line caps, forbidden `any`/`console.log`, `neverthrow` returns, Drizzle index naming, mobile styling):

```sh
pnpm check:fast     # checks git modified/uncommitted files
pnpm check:staged   # checks git staged files
```

> [!NOTE]
> `check:fast` validates file-scoped rules on your modified files in `<200ms`. Global dependency cruiser boundaries, migration lineage, and 3-locale parity trees are verified in `pnpm rules:check` and CI.

### Step 3: Targeted Unit Testing (< 2s)

Run unit tests exclusively for the module you are working on:

```sh
# Run targeted unit tests for a specific module
pnpm --filter api test:unit src/modules/<module>

# Or run tests related to changed git files
pnpm --filter api test:changed

# Or run all 148+ pure CQRS unit tests across all modules (in parallel, ~14s)
pnpm --filter api test:fast
```

Vitest resolves monorepo packages (`@repo/contracts`, `@repo/authorization`, `@repo/i18n`) directly from `src/index.ts`, so no pre-build or tsup compilation is required during development.

---

## 3. Outer Release Loop (CI / Pre-Push)

Before pushing a branch or opening a pull request, run the full verification suite:

```sh
# 1. Full 15-pass global architectural scan (depcruise, schemas, i18n, migrations)
pnpm rules:check

# 2. Complete 10-gate release verification
pnpm test:release
```

The outer loop verifies:

1. Complete TypeScript typechecking across all workspaces.
2. Dependency Cruiser module boundary isolation (zero illegal cross-module imports).
3. Complete 3-locale key parity across English, Spanish, and French.
4. Drizzle migration lineage integrity and checksum consistency.
5. All 180+ unit, integration, and isolated concurrency test suites.
6. Build artifacts for API, web, and shared packages.

---

## 4. Cheat Sheet

| Task                   | Fast Inner Loop                                        | Outer CI Loop                 |
| :--------------------- | :----------------------------------------------------- | :---------------------------- |
| **Feature Generation** | `pnpm generate:feature <mod> <feat> --minimal`         | N/A                           |
| **Architecture Rules** | `pnpm check:fast` (< 200ms)                            | `pnpm rules:check` (~4s)      |
| **Module Tests**       | `pnpm --filter api test:unit src/modules/<mod>` (< 2s) | `pnpm test:unit`              |
| **Pure CQRS Tests**    | `pnpm --filter api test:fast` (~14s)                   | `pnpm --filter api test:unit` |
| **Pre-Push Gate**      | `pnpm check:staged`                                    | `pnpm test:release`           |
