# 0031. Vitest everywhere unit, Playwright for journeys, Jest deferred

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from the three Vitest configs, Playwright specs, `TESTING_RULES.md`, and the package-policy test-framework ban.

## Context

Every layer needs a runner, but every runner added is configuration, CI minutes, and contributor onboarding. The matrix has to be minimal yet gapless.

## Decision

Vitest 5 for all unit/integration/component-logic layers (API, web with jsdom, mobile with node + native seams mocked); Playwright for browser journeys against the real stack; co-located tests everywhere. Jest with React Native Testing Library stays deferred behind an architecture-review gate (package policy bans new frameworks): mobile component tests wait for that decision rather than sneaking a runner in.

## Consequences

Gain: one unit-test skill transfers across the repo; journeys test what units can't (real browser, real backend). Pay: the mobile presentational layer is uncovered until the Jest decision lands — tracked openly, with coverage exclusions scoped to exactly that layer.

## Alternatives considered

- Jest everywhere: rejected, redundant with Vitest with no capability gain.
- Cypress: rejected, heavier runner with no advantage over Playwright for our journeys.
- No e2e (unit tests suffice): rejected, wiring bugs live exactly where units stop looking.
