# 0061. Single React version forced via pnpm overrides

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from the `overrides` block pinning React 19.2.8 (+types) workspace-wide.

## Context

Monorepos silently install multiple React copies (library peer ranges drift), producing the classic invalid-hook-call crashes that look like application bugs but aren't.

## Decision

`pnpm-workspace.yaml` overrides pin `react`, `react-dom`, and their types to one exact version across apps and packages. Bumps are deliberate, single-commit, full-suite-verified events.

## Consequences

Gain: one reconciler everywhere; an entire class of "works in web, crashes in Storybook" mysteries cannot occur. Pay: overrides can mask genuine peer incompatibilities — a major bump needs the full gate, not just the app that asked for it.

## Alternatives considered

- Floating peer ranges: rejected, guarantees slow drift into duplicate React.
- Per-package resolutions: rejected, same drift with more knobs.
