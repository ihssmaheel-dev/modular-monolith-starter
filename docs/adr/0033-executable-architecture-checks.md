# 0033. Architecture enforced by a custom checker, not just lint

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from `scripts/check-rules.js` and its growing check list (this file's own index check included).

## Context

Half our laws aren't expressible in ESLint: file placement intent, co-located tests, story coverage, channel confinement, locale parity, tenant-repository discipline. Unenforced laws are wishes.

## Decision

`scripts/check-rules.js` runs in CI (`rules:check`) alongside ESLint: file walker, per-area checks, `file: reason` failure lines. Each check is bite-proved with a deliberate violation (then removed) before it lands, per the extension protocol (ADR 0066).

## Consequences

Gain: architectural drift fails the build instead of accumulating silently; reviewers stop policing placement by hand. Pay: a bespoke script to maintain — kept honest by its own protocol, small check functions, and the same format/lint gates as everything else.

## Alternatives considered

- ESLint-only: rejected, cannot express placement, co-location, or parity rules.
- dependency-cruiser alone: kept for what it does (module boundaries), insufficient for the rest — hence both.
- No enforcement (docs only): rejected, see ADR 0034 on why prose rots.
