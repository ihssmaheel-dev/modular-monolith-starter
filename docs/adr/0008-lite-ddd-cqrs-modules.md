# 0008. Lite DDD: CQRS modules without the full tactical ceremony

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the `modules/[domain]` layout and `MODULE_RULES.md`; the shape predates this record.

## Context

We wanted domain thinking (explicit entities, value objects, events, errors) without the full tactical-DDD apparatus that slows small teams to a crawl.

## Decision

Lite DDD: every domain gets entities, value objects, domain events, and typed errors — pure, zero framework dependencies. Application logic splits into single-responsibility commands and queries (CQRS by shape, not by infrastructure: no separate read store). Controllers stay thin: validate, delegate, map `Result`. Deliberately omitted: aggregates, domain services, bounded-context mapping, event sourcing.

## Consequences

Gain: the valuable DDD parts (explicit domain language, pure testable core, events as facts) at a fraction of the ceremony; new developers learn the whole pattern from one reference module. Pay: if a domain ever grows genuinely complex subdomains, this shape will need aggregates retrofitted — accepted consciously, YAGNI until then.

## Alternatives considered

- Full tactical DDD: rejected, aggregates/repositories-per-aggregate ceremony with no complex subdomain to justify it yet.
- Anemic MVC services: rejected, logic inevitably leaks into controllers and becomes untestable without HTTP.
- Flat scripts-per-endpoint: rejected, no place for domain language to live at all.
