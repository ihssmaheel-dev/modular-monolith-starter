# 0013. Rotating refresh tokens; memory-only access tokens

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the cookie transport, rotation logic, and `PRODUCTION_ARCHITECTURE.md`. Companion to ADR 0042 (sessions/revocation); this one covers credential transport and rotation mechanics.

## Context

Tokens must survive XSS scrutiny and theft response: long-lived bearer tokens in `localStorage` are stolen wholesale, while server sessions on every request cost a lookup per call.

## Decision

Short-lived access tokens live in JS memory only (never persisted). Refresh tokens are rotating HttpOnly, Secure, SameSite=Strict cookies with single-use `jti`; each refresh mints a new pair and invalidates the old. Frontend stores persist the user profile, never the credentials.

## Consequences

Gain: stolen XSS exfiltration window shrinks to access-token lifetime; refresh theft is detectable via reuse. Pay: tabs each hold their own memory token (hence cross-tab auth sync on the web), and SSR must bootstrap the session explicitly since cookies alone don't hydrate JS state.

## Alternatives considered

- Long-lived tokens in `localStorage`: rejected, one XSS reads the crown jewels with no expiry pressure.
- Opaque session IDs for everything: rejected, a store lookup per request to avoid nothing.
