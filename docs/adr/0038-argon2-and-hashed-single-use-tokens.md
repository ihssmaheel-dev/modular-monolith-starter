# 0038. Argon2id passwords and hashed, single-use, expiring tokens

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `@node-rs/argon2` usage, the hashed reset-token flow, and invitation expiry checks.

## Context

Passwords and out-of-band tokens (password reset, invitations) sit in the database. Plaintext or fast hashes turn any read-only breach into full account takeover.

## Decision

Passwords hash with Argon2id (`@node-rs/argon2`, memory-hard). Reset and invitation tokens are stored hashed, checked against expiry on every read path, and nulled/revoked on use — single-use by construction, never reusable, never logged.

## Consequences

Gain: stolen rows are not stolen sessions; OWASP-aligned posture for audits. Pay: a native binding in the build (`@node-rs`), and token flows need an explicit expiry + consumption step every time — no casual token columns.

## Alternatives considered

- bcrypt: solid but CPU-only hardness; Argon2id resists GPU/ASIC cracking better for the same verify latency.
- JWT-style stateless reset tokens: rejected, cannot be revoked before expiry.
- Plaintext/storable tokens: rejected outright, indefensible in review.
