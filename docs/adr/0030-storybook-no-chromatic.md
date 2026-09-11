# 0030. Storybook catalog, self-hosted, no Chromatic

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** frontend
- **Backfilled:** no — decided during implementation on this date.

## Context

Sixty-plus UI primitives with no visual catalog meant the only way to see a component was booting the whole app logged in — slow reviews, blind refactors, dark mode never systematically checked.

## Decision

Storybook 10 with the React-Vite builder, docs/a11y/themes addons, real `globals.css` with generated tokens, and a light/dark toggle matching the app's variant. Co-located stories per component, enforced by rule; static export verified in CI. Chromatic explicitly excluded: paid cloud visual testing violates the zero-paid-services rule.

## Consequences

Gain: every primitive reviewable in isolation in both themes, with accessibility audits per story; AI assistants gain copy-paste-correct usage examples. Pay: stories are maintenance surface (kept honest by the co-location rule), and visual regression stays human until a free self-hosted option is evaluated.

## Alternatives considered

- Chromatic: rejected on cost/policy grounds despite being the best tool for the job — noted without resentment.
- No catalog (Storybook never): rejected, keeps the review bottleneck and the dark-mode blind spot.
- Ladle/Histoire: rejected, smaller ecosystems around our exact stack for no compensating advantage.
