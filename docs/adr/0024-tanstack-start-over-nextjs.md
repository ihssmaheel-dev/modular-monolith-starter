# 0024. TanStack Start over Next.js

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** frontend
- **Backfilled:** yes — reconstructed from the Start/Router/Query stack, file-based routes, and the self-hosted SSR bundle.

## Context

The web app needs SSR, file-based routing, and type-safe URL state — without marrying a deployment vendor to get them.

## Decision

TanStack Start (Vite + file-based TanStack Router + SSR streaming) with TanStack Query and Zustand. Routes are thin composers over feature components; search params are Zod-validated schemas, not strings. The production output is a self-hosted SSR bundle, deployable anywhere Node runs.

## Consequences

Gain: no vendor gravity, full type inference across routes/search/loaders, streaming SSR without framework lock-in. Pay: smaller ecosystem than Next.js (fewer copy-paste answers), and SSR pitfalls (server-only code, hydration) are ours to manage.

## Alternatives considered

- Next.js: rejected, Vercel gravity plus a heavier framework for needs TanStack covers.
- SPA-only Vite: rejected, surrenders SSR first paint/SEO and server-side data loading for simplicity that stops paying off immediately.
