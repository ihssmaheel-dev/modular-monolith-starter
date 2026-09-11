# 0032. Co-located tests with low, ratcheting coverage gates

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from test placement, the coverage thresholds, and the co-location rule.

## Context

Central `__tests__` directories drift from their sources, and day-one 80% gates fail immediately — then get disabled, teaching everyone gates are decorative.

## Decision

One test file per source file, sitting next to it (`*.test.ts[x]`), enforced by rule for feature data modules and UI components. Coverage gates start low (around 50/40) so they're green on day one, and ratchet upward as coverage grows — a gate that passes honestly beats an ambitious one that's ignored.

## Consequences

Gain: tests live where eyes already are; gates stay green and therefore meaningful; ratchets convert progress into permanent standards. Pay: co-location litters feature directories (accepted: proximity beats tidiness), and someone must actually turn the ratchet periodically.

## Alternatives considered

- Central test directories: rejected, distance breeds neglect — unwatched tests rot first.
- 80% gates from day one: rejected, fails immediately and trains the team to bypass gates.
- No coverage gates: rejected, coverage then decays to whatever the busiest quarter allows.
