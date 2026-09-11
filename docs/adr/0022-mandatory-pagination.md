# 0022. Pagination is mandatory, unbounded lists are a bug

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** contracts
- **Backfilled:** yes — reconstructed from `PaginationQuerySchema`, `MAX_PAGE_LIMIT`, and the always-present page/limit/total/totalPages shape.

## Context

One unbounded `SELECT *` endpoint becomes a latency bomb and a scraping enabler the moment a table grows. Deciding pagination per endpoint guarantees inconsistency.

## Decision

Every list endpoint paginates with the shared shape (`page`, `limit`, `total`, `totalPages`) from `PaginationQuerySchema`, with `MAX_PAGE_LIMIT` capping page size server-side (clients asking for more get clamped, not rejected — friendly but bounded). No endpoint returns an unbounded array, no exceptions.

## Consequences

Gain: predictable performance envelope on every list; clients can rely on one shape everywhere. Pay: even tiny lists pay the pagination ceremony, and "just give me everything" export needs are served by the export flow instead.

## Alternatives considered

- Optional pagination per endpoint: rejected, the busy endpoints are exactly the ones developers skip it on.
- Cursor pagination everywhere: rejected, heavier contract for tables where offset pages are perfectly adequate at capped sizes.
