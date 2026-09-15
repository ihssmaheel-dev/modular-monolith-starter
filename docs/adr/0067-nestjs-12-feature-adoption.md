# 0067. NestJS 12 feature adoption and selective skips

- **Status:** accepted
- **Date:** 2026-09-14
- **Scope:** backend | quality | ops
- **Backfilled:** no

## Context

Upgrading `apps/api` to NestJS 12 introduced several new framework capabilities alongside major ecosystem shifts (native ESM packaging, standard schema validation, route diagnostics, and structured error codes). We needed to determine which features genuinely strengthen the modular monolith without violating architecture rules or causing churn.

## Decision

We adopt three high-leverage features, enhance shutdown lifecycle safety, and deliberately reject two framework defaults:

1. **Route-Conflict Diagnostics (`main.ts`)**: Enable `routeConflictPolicy: { duplicate: 'error', shadow: 'warn' }` and `routeResolutionStrategy: 'specificity'`. This catches duplicate or shadowed route paths at bootstrap across REST, oRPC (`/rpc`), health, and OpenAPI endpoints.
2. **Native `errorCode` on `HttpException` (`error-envelope.utils.ts`)**: Wire `HttpExceptionOptions.errorCode` into `createApiErrorEnvelope`, preferring it as the primary machine-readable error code while maintaining complete compatibility with localized i18n message keys.
3. **WebSocket Disconnect Reasons (`realtime-websocket.gateway.ts`)**: Accept `reason?: string` in `handleDisconnect` and record it in debug logs with tenant and user context, distinguishing client network drops from server token-expiry sweeps.
4. **Shutdown Teardown Hardening (`main.ts`)**: Enable `return503OnClosing: true` in `NestApplicationOptions`, ensuring new HTTP connections receive 503 while in-flight requests and `BeforeApplicationShutdown` drains complete.
5. **Retain Custom Response Interceptor & Pipe**: Keep our 41-line `ResponseValidationInterceptor` and `ZodValidationPipe` instead of `StandardSchemaSerializerInterceptor`. Nest's native interceptor throws untyped errors concatenating validation messages (risking internal schema leaks) and lacks structured Pino/Loki logging.
6. **Skip In-Source ESM Migration**: Compile TypeScript with `"module": "nodenext"` on the pinned,
   CI-tested Node 22.12 runtime, allowing Node to consume ESM packages without churn across internal
   imports. A Node major upgrade is a coordinated toolchain change, not an assumption in this ADR.

## Consequences

Gain: Bootstrap-time route collision detection; structured, trace-correlated WebSocket disconnect telemetry; native error code serialization in HTTP envelopes; safe 503 shedding during graceful shutdown.
Pay: Developers must be aware that Fastify already resolves route specificity at runtime, and custom response validation remains an application-maintained interceptor rather than framework-native.

## Alternatives considered

- Default `StandardSchemaSerializerInterceptor`: rejected, throws stringified validation errors that lack structured Pino `{ issues }` logging and risk exposing internal schema contracts.
- Native `StandardSchemaValidationPipe`: rejected, cannot perform per-issue locale dictionary translation via `I18nService`.
- Full ESM source migration (`"type": "module"` with `.js` import paths): rejected, creates massive churn across 575 modules with zero runtime performance benefit.
