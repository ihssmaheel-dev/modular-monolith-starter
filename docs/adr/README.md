# Architecture Decision Records

Decisions with a half-life longer than a sprint. Read the template (`0000-template.md`) before adding one; the qualifying test is in it.

| Number | Title                                                             | Status   |
| ------ | ----------------------------------------------------------------- | -------- |
| 0001   | Modular monolith over microservices                               | accepted |
| 0002   | pnpm + Turborepo + a pinned toolchain                             | accepted |
| 0003   | Strict TypeScript and enforced LF endings                         | accepted |
| 0004   | MIT license and zero paid/proprietary dependencies                | accepted |
| 0005   | NestJS with the Fastify adapter                                   | accepted |
| 0006   | Drizzle ORM, SQL-first                                            | accepted |
| 0007   | neverthrow Results, no throwing in domain and application layers  | accepted |
| 0008   | Lite DDD: CQRS modules without the full tactical ceremony         | accepted |
| 0009   | Transactional outbox plus BullMQ for async work                   | accepted |
| 0010   | One unified fine-grained authorization engine                     | accepted |
| 0011   | Pooled tenancy behind a deployment-scoped mode flag               | accepted |
| 0012   | oRPC primary transport with REST compatibility                    | accepted |
| 0013   | Rotating refresh tokens; memory-only access tokens                | accepted |
| 0014   | Presigned uploads — the server never touches bytes                | accepted |
| 0015   | Piscina worker threads plus api/worker process roles              | accepted |
| 0016   | Edge protection baseline on every route                           | accepted |
| 0017   | Journaled migrations applied before boot                          | accepted |
| 0018   | Per-instance realtime stream groups for true fan-out              | accepted |
| 0019   | `@repo/contracts` as the single source of truth                   | accepted |
| 0020   | i18n: shared dictionaries, enforced parity, never hardcoded       | accepted |
| 0021   | One API client factory per app                                    | accepted |
| 0022   | Pagination is mandatory, unbounded lists are a bug                | accepted |
| 0023   | Stable error envelope plus trace-correlated reference IDs         | accepted |
| 0024   | TanStack Start over Next.js                                       | accepted |
| 0025   | Zustand for client state, Query for server state, tuned retention | accepted |
| 0026   | Base UI plus shadcn, locked against alternatives                  | accepted |
| 0027   | One token file fans out to web, email, and mobile                 | accepted |
| 0028   | Expo + NativeWind app mirroring the web                           | accepted |
| 0029   | Cross-tab sync framework with a fenced experimental broadcast     | accepted |
| 0030   | Storybook catalog, self-hosted, no Chromatic                      | accepted |
| 0031   | Vitest everywhere unit, Playwright for journeys, Jest deferred    | accepted |
| 0032   | Co-located tests with low, ratcheting coverage gates              | accepted |
| 0033   | Architecture enforced by a custom checker, not just lint          | accepted |
| 0034   | Machine-readable architecture laws (`ai_instructions/`)           | accepted |
| 0035   | Changesets for versioned releases                                 | accepted |
| 0036   | Deliberate no's: MSW, snapshots, leader election, visual cloud    | accepted |
| 0037   | Line endings pinned by `.gitattributes`, not by OS luck           | accepted |
| 0038   | Argon2id passwords and hashed, single-use, expiring tokens        | accepted |
| 0039   | JWT key rotation without forced logouts                           | accepted |
| 0040   | Supply-chain posture: scanning, ownership, automation             | accepted |
| 0042   | Hybrid sessions: stateless reads, stateful revocation             | accepted |
| 0043   | One Redis, five jobs — with graceful degradation                  | accepted |
| 0044   | SSE and WebSocket both, each for its traffic                      | accepted |
| 0045   | A scripted single → multi tenancy migration path                  | accepted |
| 0051   | Native `validateSearch` over nuqs for URL state                   | accepted |
| 0054   | SecureStore (not AsyncStorage) for mobile credentials             | accepted |
| 0055   | Expo push as the single sanctioned external service               | accepted |
| 0056   | No OTA updates — store releases only                              | accepted |
| 0058   | Env-JSON feature flags, no vendor                                 | accepted |
| 0061   | Single React version forced via pnpm overrides                    | accepted |
| 0066   | The enforcer evolves by protocol, not accretion                   | accepted |
