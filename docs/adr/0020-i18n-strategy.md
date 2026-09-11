# 0020. i18n: shared dictionaries, enforced parity, never hardcoded

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** contracts
- **Backfilled:** yes — reconstructed from `@repo/i18n` (en/es/fr), backend `I18nService`, react-i18next usage, and the parity gate.

## Context

Untranslated strings ship silently, backend errors leak in one language, and "we'll translate later" means never. Retrofitting i18n onto a shipped product is a rewrite of every string.

## Decision

All user-facing text lives in `@repo/i18n` JSON dictionaries (English, Spanish, French). Backend errors go through `I18nService` with stable keys; frontend uses `react-i18next` with the same keys; hardcoded user-facing strings and error messages are rule violations. `rules:check` enforces locale parity (no missing/extra keys) and rejects unknown keys at authorship time.

## Consequences

Gain: a new language is a new JSON file, not a refactor; untranslated keys fail the build instead of reaching users. Pay: every string costs a key plus three translations up front — slower first draft, zero translation debt.

## Alternatives considered

- English-only now, i18n later: rejected, the retrofit is the most expensive translation strategy that exists.
- Per-app translation files: rejected, the same string translated three different ways across web, mobile, and API.
