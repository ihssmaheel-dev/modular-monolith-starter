# 0056. No OTA updates — store releases only

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** mobile
- **Backfilled:** yes — a decision by omission, recorded deliberately before someone "just adds it."

## Context

Over-the-air JS updates (Expo Updates) let fixes skip store review. Tempting for velocity, dangerous for traceability: the binary a user runs stops matching any reviewed release.

## Decision

No OTA channel is configured. Every mobile release goes through store review from a tagged build, so any installed version maps to exactly one reviewed commit.

## Consequences

Gain: release discipline, audit trail, no silent-code-push incident class. Pay: urgent fixes wait on review; hotfix process must be fast instead (that's the trade, stated plainly).

## Alternatives considered

- Expo Updates enabled: rejected, trades traceability for speed in exactly the releases where traceability matters most (security fixes).
