# 0034. Machine-readable architecture laws (`ai_instructions/`)

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from the `ai_instructions/` set and the `rules:check` gate; the practice predates this record.

## Context

Conventions written only in prose rot: contributors skim them, AI assistants never saw them. We wanted rules a human reads once and a machine enforces every time — especially as AI-written code became a large share of changes.

## Decision

`ai_instructions/` holds mandatory, ordered rule files (stack, placement, errors, i18n, frontend, quality, security, testing, packages, performance). Agents read them before every task; `scripts/check-rules.js` enforces the checkable subset in CI; the PR template points at the same contract.

## Consequences

Gain: consistent output from humans and AI alike, cheap onboarding, reviews argue about product instead of placement. Pay: the rules are code-adjacent documentation — they must be maintained like code or they become lies (stale rules are worse than none).

## Alternatives considered

- Wiki/Notion conventions: rejected, unenforceable and invisible to agents.
- Pure lint rules for everything: rejected, half the laws (placement intent, layering judgment) aren't expressible in ESLint — hence a custom checker instead.
