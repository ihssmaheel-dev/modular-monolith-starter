# 0026. Base UI plus shadcn, locked against alternatives

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** frontend
- **Backfilled:** yes — reconstructed from `@repo/ui` (Base UI primitives + base-nova + Tailwind 4 + CVA + lucide) and the package-policy ban list.

## Context

UI libraries are a one-way door: adopting two design systems means two of everything forever — theming, a11y fixes, upgrades.

## Decision

Headless Base UI React primitives styled with the shadcn base-nova system, Tailwind 4 tokens, CVA variants, and lucide icons — in `@repo/ui`, consumed by web, never by mobile (DOM-only). MUI, Ant Design, Chakra and friends are banned by policy, not by taste: the ban is what keeps the door one-way.

## Consequences

Gain: one design language, accessible primitives for free, theming via tokens. Pay: anything Base UI doesn't cover must be built (accepted rarely), and major version upgrades touch every screen at once.

## Alternatives considered

- MUI / AntD / Chakra: rejected each time, full-kitchen-sink weight plus a second design language to maintain.
- Unstyled hand-rolled components: rejected, rebuilds accessibility (focus, ARIA, keyboard) badly and slowly.
- shadcn CLI output copied per app: rejected, forks the system on first paste; the shared package is the point.
