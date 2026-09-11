# 0055. Expo push as the single sanctioned external service

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** mobile
- **Backfilled:** yes — reconstructed from the `provider: "expo"` device registration and the zero-external-services rule it tensions against.

## Context

Push needs APNs and FCM. Direct integration means two native integrations, two credential sets, and two failure modes to operate.

## Decision

Expo push service is the one sanctioned exception to the no-external-services rule: one provider, one token flow, one server-side fan-out. Stated openly, including the cost: fully air-gapped customers lose push (everything else stays self-hostable).

## Consequences

Gain: push works in days, not sprints; single operational surface. Pay: a cloud dependency with its own limits/quotas, and an honest asterisk on the on-prem story.

## Alternatives considered

- Direct FCM + APNs: rejected, doubles native integration and credential operations for no product difference.
- No push at all: rejected, notification preferences without a push channel would be a hollow feature.
