# 0005. NestJS with the Fastify adapter

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the module architecture and adapter choice; the pairing predates this record.

## Context

The backend needs dependency injection that mirrors the module boundaries (ADR 0001/0008) plus an HTTP layer fast enough that the framework is never the bottleneck.

## Decision

NestJS for structure (modules, providers, guards, testing harness) on the Fastify adapter for throughput — async-first request handling with schema-friendly validation hooks, instead of the default Express adapter.

## Consequences

Gain: architecture and framework pull in the same direction (a NestJS module IS a domain module); measurably faster JSON throughput; middleware ecosystem largely compatible. Pay: occasional Express-only middleware needs a Fastify equivalent or an adapter shim, and contributors must learn Fastify reply/request idioms.

## Alternatives considered

- NestJS + Express: rejected, slower and less strict without compensating familiarity value at this point.
- Bare Fastify without NestJS: rejected, loses DI, guards, and the module system the whole backend is organized around.
- Hono/Elysia-style minimal frameworks: rejected, immature DI/testing story for an enterprise-shaped codebase.
