# 0042. Hybrid sessions: stateless reads, stateful revocation

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the access/refresh split, auth-version increments, Redis revocation fan-out, and realtime disconnects.

## Context

Pure JWT sessions can't be killed (logout, password reset, and admin ban all need instant effect). Pure server sessions cost a store lookup on every request. We wanted both properties.

## Decision

Short-lived access tokens verify offline (issuer, audience, algorithm, account version); refresh tokens are rotating HttpOnly cookies with single-use `jti`. Logout, password reset, and admin actions increment the account version and fan revocation out over Redis — including closing live realtime connections on every replica. Reuse of a spent refresh token is rejected while Redis is reachable.

## Consequences

Gain: fast reads, instant kill, cross-replica consistency. Pay: revocation depends on Redis — when Redis is down the system degrades toward JWT-expiry semantics (documented, not hidden); access tokens in JS memory demand XSS discipline (CSP, no inline handlers).

## Alternatives considered

- Pure stateless JWT: rejected, logout would be a lie until expiry.
- Pure server sessions: rejected, a store round-trip on every authenticated request for no product benefit.
- Opaque tokens everywhere: rejected, same cost as server sessions with extra lookup code.
