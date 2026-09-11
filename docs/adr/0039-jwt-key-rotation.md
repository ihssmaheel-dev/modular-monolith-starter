# 0039. JWT key rotation without forced logouts

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `JWT_SIGNING_KEYS`, `kid` handling, and the legacy fallback in `PRODUCTION_ARCHITECTURE.md`.

## Context

Signing keys must rotate (leak response, routine hygiene), but rotating must not log out every user and every device at once.

## Decision

`kid`-keyed signing key sets: new tokens carry the active `kid`, verification accepts every retained key, legacy tokens without `kid` fall back to the legacy secret. Old keys stay until the maximum token lifetime elapses, then are removed.

## Consequences

Gain: rotation is a config change, not an incident; no mass logout ever. Pay: key-lifecycle discipline — someone must actually remove old keys on schedule, and verification touches a key set instead of one secret.

## Alternatives considered

- Single secret swap: rejected, forces global logout and breaks all sessions at once.
- Asymmetric (RSA/ECDSA) keys: kept as a future option for multi-service verification; symmetric HS is sufficient inside one deployable today.
