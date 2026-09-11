# 0010. One unified fine-grained authorization engine

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `@repo/authorization` (pure evaluator + action vocabulary) and its controller/service enforcement points.

## Context

Role checks alone ("is admin?") collapse the moment permissions need ownership ("their own notes") or attributes ("same department", "paid plan"). Bolting those on later produces three inconsistent auth systems.

## Decision

One FGA engine combining RBAC + ReBAC + ABAC: a centralized action vocabulary (`notes:create`, `team:invite`, …), relationship checks (ownership), and attribute predicates (tenant, department), evaluated by a pure function package. Enforced at controllers via decorators and inside application services where ownership must be re-checked.

## Consequences

Gain: one place where "who can do what" lives; new rules compose instead of spawning parallel systems; the evaluator is pure and unit-testable to exhaustion. Pay: every new action needs vocabulary + tests (deliberate friction), and attribute-heavy rules must stay readable or they become write-only policy.

## Alternatives considered

- Roles only: rejected, collapses at the first ownership requirement and never recovers cleanly.
- OPA/Cedar sidecar: rejected, network hop per decision plus a second policy language to staff.
- Scattered inline checks: rejected, unauditable — the exact mess the vocabulary centralizes away.
