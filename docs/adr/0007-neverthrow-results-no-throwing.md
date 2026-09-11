# 0007. neverthrow Results, no throwing in domain and application layers

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `EVENT_AND_ERROR_RULES.md`, typed domain errors, and the envelope mapper.

## Context

Thrown exceptions are invisible in signatures: callers can't know what can fail, tests can't enumerate failures, and a missed `catch` becomes a 500 far from its cause.

## Decision

Domain and application layers return `neverthrow` `Result<T, E>` with typed error unions per operation and never throw. Only the presentation edge throws/catches: controllers and filters map `Result` errors to the stable error envelope (code + i18n key + request ID). `rules:check` rejects `throw` in those layers.

## Consequences

Gain: every failure mode is visible in the type signature, exhaustively testable, and translated at exactly one boundary. Pay: verbose call sites (`isErr`/`mapErr` chains) and a learning curve for exception-trained developers.

## Alternatives considered

- Exceptions with global catch-all: rejected, untyped failure surface and translation scattered across catch sites.
- String error codes without types: rejected, ungreppable and unexhaustive — typos become runtime mysteries.
