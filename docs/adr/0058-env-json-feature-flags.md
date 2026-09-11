# 0058. Env-JSON feature flags, no vendor

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `FEATURE_FLAGS` parsing and the flags service.

## Context

Kill switches and gradual rollouts are needed, but a flags SaaS (LaunchDarkly and friends) is another external service, another bill, and another hole in the on-prem story.

## Decision

`FEATURE_FLAGS` env JSON plus a small evaluation service. Flags change at deploy time, evaluate synchronously in-process, and work identically air-gapped.

## Consequences

Gain: zero infrastructure, zero vendors, works everywhere the app runs. Pay: no runtime targeting UI and no per-user percentage rollouts without a deploy — flags are coarse (on/off per deployment), honestly so.

## Alternatives considered

- LaunchDarkly/Unleash/self-hosted flag service: rejected, disproportionate operations for coarse flags; revisit if per-user targeting becomes a real need rather than a hypothetical one.
- Hardcoded conditionals: rejected, unchangeable without a code edit and invisible in review.
