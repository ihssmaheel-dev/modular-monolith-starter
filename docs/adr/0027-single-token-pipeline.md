# 0027. One token file fans out to web, email, and mobile

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** frontend
- **Backfilled:** yes — reconstructed from `design-tokens` presets, `theme:generate`/`theme:check`, and the three generated targets.

## Context

Brand drift across web CSS, email HTML, and native styles is inevitable when each platform owns its colors. A reskin should be an afternoon, not a quarter.

## Decision

`design-tokens` presets (`active.json`, Zod-validated) are the single source; `theme:generate` fans out to web CSS variables (light/dark), email token module, and mobile hex/NativeWind theme. `theme:check` fails CI on stale generated files — generated output is committed, never hand-edited.

## Consequences

Gain: rebrands and dark-mode tuning happen in one file; all three surfaces stay consistent by construction. Pay: token shape changes ripple everywhere at once (that's the point, but big renames are flag days), and contributors must learn to never touch generated files.

## Alternatives considered

- Per-platform palettes: rejected, the drift factory — three "primary blues" within a year, guaranteed.
- Runtime theming service: rejected, overkill next to build-time generation for a starter's needs.
