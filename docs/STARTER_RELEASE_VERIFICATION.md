# Starter release verification — 22 September 2026

## Release decision

**Status: conditional; the branch is not yet certified as the v1.0 production baseline.**

The high-risk implementation work in the remediation plan is substantially complete and the repository's automated quality gates pass. The remaining work is concentrated in durable identity-email delivery and production-environment evidence. This document deliberately separates verified behavior from implementation that has only focused test coverage and from deployment drills that have not been run.

Source plan: [Starter remediation plan](STARTER_REMEDIATION_PLAN_2026-09-22.md)

Source audit: [Architecture starter re-audit](ARCHITECTURE_STARTER_REAUDIT_2026-09-22.md)

## Tested baseline

| Item                                       | Value                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Starting revision                          | `74deb0d07479bba4dc4e5fe385d4c1bc634d1382`                                                            |
| Working branch                             | `fix/starter-release-hardening`                                                                       |
| Source state                               | Uncommitted working tree; image digests below are local verification artifacts, not release artifacts |
| Host runtime                               | Node `v22.23.2`, pnpm `10.34.5`, Docker Engine `29.8.0`                                               |
| Supported runtime in repository and images | Node `24.21.0`, pnpm `10.34.5`                                                                        |
| Verification date                          | 22 September 2026                                                                                     |

The host Node version is outside the repository's supported range. Compile, test, and container evidence remains valid, but a release run must use Node 24.21.0 so local and CI runtime behavior agree.

## Verification results

| Gate                           | Result                     | Evidence                                                                                                                         |
| ------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Architecture rules             | Pass                       | `pnpm rules:check`                                                                                                               |
| Type checking and lint         | Pass                       | 14/14 Turbo tasks with forced cache bypass                                                                                       |
| Unit tests                     | Pass                       | 253 files, 1,318 tests across API, web, mobile, API client, and authorization                                                    |
| API end-to-end tests           | Pass                       | 39 tests against disposable Testcontainers dependencies                                                                          |
| PostgreSQL integration         | Pass                       | 5 tests across 2 files after migration on a disposable database                                                                  |
| Migration lineage              | Pass                       | 8 immutable migrations, including `0007_secret_catseye.sql`; fresh and upgrade checks pass                                       |
| Generator/tooling              | Pass                       | Generator smoke created 37 TypeScript files; project-init and staging launcher tooling tests pass                                |
| Production-like stack          | Pass with scope limitation | Disposable PostgreSQL, Redis, MinIO, bucket initialization, Mailpit, migration, API, worker, built web, and Nginx became healthy |
| Production browser             | Pass with scope limitation | Playwright CSP/SSR and hydration smoke: 1/1; the complete user and file workflows are not yet covered                            |
| Observability configuration    | Pass                       | Static configuration validation and Prometheus rule tests; 41 rules pass `promtool`                                              |
| Workspace build                | Pass                       | API, web, mobile iOS export, and mobile Android export                                                                           |
| Web bundle budget              | Pass                       | 73 scripts, 397,813 gzip bytes total; largest entry 395.86 KB raw / 127.35 KB gzip                                               |
| Dependency vulnerability audit | Pass                       | `pnpm audit --audit-level high` reported no known high-severity vulnerabilities                                                  |
| Formatting and patch integrity | Pass                       | Format check and `git diff --check`                                                                                              |

Warnings observed during passing gates must remain visible: mobile tests emit upstream React test-renderer/`act` warnings, and Turbo reports that the type-only `@repo/ui` build has no output artifact configured.

## Production image evidence

Both images were rebuilt from the current working tree after recursive Docker build-output exclusions were added. Build context fell from approximately 128 MB to approximately 100 KB.

| Image | Local digest                                                              |                 Uncompressed size | Offline runtime check                                              |
| ----- | ------------------------------------------------------------------------- | --------------------------------: | ------------------------------------------------------------------ |
| API   | `sha256:cb19b6851305534bca02c5fc87cc6ac98a35a8d19acb234cad3234267f8309d6` | 630,900,166 bytes (about 602 MiB) | Node 24.21.0 and pnpm 10.34.5 pass with Docker networking disabled |
| Web   | `sha256:a49acafc8b4a316cdcc8828e44122ffd53cec44ee3a1d40ceb530f258a2666d7` | 721,718,472 bytes (about 688 MiB) | Node 24.21.0 and pnpm 10.34.5 pass with Docker networking disabled |

These sizes are functional but larger than desirable for registry transfer, cold pulls, and aggressive autoscaling. They do not create an unbounded runtime cost by themselves, but image slimming should be completed before high-churn or multi-region deployment. A registry vulnerability scan and verification of the pushed provenance/SBOM attestations are still release gates.

## Work-package closure ledger

| Package                                   | Status                                         | Verified result and remaining evidence                                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 — baseline                             | Complete                                       | Dedicated branch preserves the existing work; baseline revision and runtime are recorded here                                                                                                                                                                       |
| P1 — isolated production test environment | Partial                                        | Disposable full stack and bounded readiness/cleanup pass; profile currently uses HTTP and covers CSP/SSR smoke rather than the complete register/login/refresh/upload/scan/attach/download/notification flow                                                        |
| P2 — SSR nonce and CSP                    | Implemented; broader browser evidence required | Supported router nonce, per-document policy, no conflicting Nginx document CSP, focused tests, and production smoke pass                                                                                                                                            |
| P3 — durable outcomes and idempotency     | Partial                                        | Explicit required-consumer registry, failure propagation, observer-only classification, stable queue job IDs, and notification effect idempotency are implemented; welcome/invitation email delivery intent is not persisted in PostgreSQL before queue publication |
| P4 — file scan state machine              | Implemented; failure matrix required           | Single worker ownership, leases, fencing, retry state, safe object keys, client polling, migration, and focused tests pass; two-worker crash/promotion and browser upload workflow need production integration evidence                                             |
| P5 — bounded SSE                          | Implemented; soak required                     | Event/byte/drain bounds, disconnect behavior, resynchronization, registry cleanup, and focused tests pass; sustained slow-client/multi-instance evidence is pending                                                                                                 |
| P6 — refresh and cookies                  | Implemented; browser matrix required           | Bounded Web Locks coordination, timeouts, fail-closed behavior, cookie domain validation, and focused tests pass; cross-tab crash/timeout behavior needs browser integration coverage                                                                               |
| P7 — database and optional pooler         | Partial                                        | Direct PostgreSQL is the verified default; request-wide transactions are opt-in, query instrumentation is present, and lock failures fail closed; the advertised PgBouncer TLS profile has not been exercised live                                                  |
| P8 — observability and cost signals       | Partial                                        | Metric contracts, alert rules, dashboards, and 41 Prometheus rule tests pass; telemetry volume, cardinality, retention growth, process memory, and provider-operation rates have not been measured under load                                                       |
| P9 — runtime, images, release tooling     | Partial                                        | Runtime pins, production image builds, health checks, offline Node/pnpm, dependency audit, and attestation configuration pass; registry scan/attestation verification and image slimming remain                                                                     |
| P10 — rules, docs, initialization         | Substantially complete                         | Rules, architecture documentation, dependency boundaries, example pruning, and generator smoke are reconciled; a fully renamed neutral project without Notes has not yet been built and exercised end to end                                                        |
| P11 — release verification                | Partial                                        | Automated gates above pass; load, outage, recovery, rolling deployment, and cost-envelope drills remain                                                                                                                                                             |

## Supported profile matrix

| Profile                                                      | Current status                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Local development with direct PostgreSQL/Redis/MinIO/Mailpit | Verified by automated tests and production-like Compose                                                                   |
| Production image with direct PostgreSQL                      | Image build and disposable-stack startup verified                                                                         |
| Same-origin web and API behind Nginx                         | Verified over the HTTP test profile                                                                                       |
| Named-host HTTPS deployment                                  | Configuration exists; certificate, trust, redirect, and full browser behavior require deployment-environment verification |
| PgBouncer with encrypted upstream PostgreSQL                 | Optional and unverified; do not advertise as a certified profile until its integration test passes                        |
| Horizontally scaled API/workers                              | Designed for it and covered by focused idempotency/lease tests; sustained multi-replica failure testing remains           |

## Open v1.0 release gates

1. Persist welcome and invitation email delivery intent in PostgreSQL before acknowledging the required outbox consumer. Relay pending intents to BullMQ with stable identities and expose queued, delivered, failed, and retryable states. Do not claim exactly-once SMTP delivery.
2. Extend the production Playwright suite through registration/login/refresh, tenant isolation, upload/scan/attach/download, worker-driven notification, protected deep links, error pages, and cross-tab refresh recovery over the named-host HTTPS profile.
3. Exercise the PgBouncer TLS profile or clearly mark it experimental and unsupported for v1.0.
4. Run bounded slow-client, upload concurrency, consumer crash/retry, dependency-outage, graceful-shutdown, and rolling-deployment scenarios.
5. Restore a backup into a clean environment and record observed RPO/RTO plus outbox/file reconciliation behavior.
6. Run a defined load/soak profile with container resource limits. Record latency, error rate, throughput, queue drain, database pool use, memory plateau, telemetry bytes/minute, log/trace/metric growth, storage operations, and provider deliveries.
7. Set deployment-specific autoscaling ceilings, log/trace/metric retention, object lifecycle, queue retention, provider quotas, billing budgets, and alert ownership. These values cannot be safely hard-coded as universal starter defaults.
8. Scan the final pushed images, verify SBOM/provenance attestations against registry digests, and reduce runtime image size where practical.
9. Generate a neutral project, remove Notes through the supported workflow, then build, migrate, test, and start it from the published onboarding documentation.

## Resource and capacity statement

No universal requests-per-second or cloud-cost claim is supported by this evidence. Capacity depends on endpoint mix, Argon2 concurrency, database tier/indexes, tenant distribution, upload size, queue work, telemetry sampling, and container limits. The starter now has better bounds and cost signals, but a project must run the workload in gate 6 on its intended infrastructure before choosing autoscaling thresholds or estimating spend.

## Release rule

Do not label this working tree “production ready” solely because the automated repository checks pass. It is a strong implementation candidate. It becomes the v1.0 baseline after the open gates that apply to the advertised deployment profiles have reproducible evidence and the resulting commit and pushed image digests replace the local values in this document.
