# 0012. oRPC primary transport with REST compatibility

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the oRPC contracts, the REST fallback subclients, and the parity test suite.

## Context

End-to-end type safety eliminates an entire class of client/server drift, but API consumers, webhooks, and migrations still need plain REST. Picking one exclusively punishes the other audience.

## Decision

oRPC is the primary runtime transport under `/api/v1/rpc`; REST controllers remain the compatibility transport under `/api/v1`. Both delegate to the same application commands and queries, and parity/smoke tests enforce that they stay equivalent. Scalar serves the interactive reference from the same contracts.

## Consequences

Gain: compiler-caught drift on the hot path, REST available wherever interop demands it, one set of handlers to maintain. Pay: two surfaces to keep honest (hence the parity tests — without them this decision rots), and contributors must learn oRPC conventions.

## Alternatives considered

- REST only with hand-written clients: rejected, drift between docs, client, and server is a matter of time.
- tRPC: capable, but oRPC's first-class OpenAPI/REST duality fit the migration story better.
- GraphQL: rejected, no graph-shaped queries in the product to justify gateway ops and query-complexity policing.
