# 0066. The enforcer evolves by protocol, not accretion

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from how co-located-test, fetch, story, and cross-tab checks were each added.

## Context

`check-rules.js` grows with every slice (tests, fetch, stories, channels…). Without a protocol it becomes the dumping ground it polices against elsewhere.

## Decision

Every new check follows the same shape: walk a scope, report `file: reason` lines, skip generated/dependency output, and get bite-proved with a deliberate violation that is then removed. The check's own rationale lives beside it in one comment, and the user-facing rule lands in the matching `ai_instructions/` file in the same slice.

## Consequences

Gain: checks stay uniform, reviewable, and genuinely biting; contributors can add the next one without inventing conventions. Pay: small ceremony per check (probe + docs) — cheaper than debugging why a check silently stopped working.

## Alternatives considered

- Off-the-shelf architecture linters: rejected repeatedly, half our laws (placement intent, co-location, story coverage) aren't expressible in them.
- Unchecked script growth: rejected, would turn the gate into untrusted folklore within months.
