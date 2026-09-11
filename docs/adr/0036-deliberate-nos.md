# 0036. Deliberate no's: MSW, snapshots, leader election, visual cloud

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — a standing record, extended whenever a fashionable default gets declined with reasons.

## Context

Every popular default arrives with social pressure to adopt it. Recording refusals with reasons stops the same debate recurring and the tool creeping in through one PR.

## Decision

No, with reasons, until evidence changes: MSW (mocked API client is thinner and matches the mock-repository backend philosophy); snapshot tests (brittle diffs that train approve-without-reading); cross-tab leader election (distributed locking to optimize a millisecond race); cloud visual-regression services (paid, policy-banned — see ADR 0030).

## Consequences

Gain: the test pyramid stays fast and intentional; future advocates must beat the recorded reasoning, not relitigate from zero. Pay: if any refusal proves wrong, this file must be updated, not quietly ignored — a stale no is worse than none.

## Alternatives considered

- Adopting each on arrival: rejected, tool sprawl with overlapping jobs and compounding CI minutes.
- Silent non-use: rejected, indistinguishable from ignorance six months later.
