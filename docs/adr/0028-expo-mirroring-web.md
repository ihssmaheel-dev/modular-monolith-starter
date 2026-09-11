# 0028. Expo + NativeWind app mirroring the web

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** mobile
- **Backfilled:** yes — reconstructed from the Expo app (file-based expo-router, mirrored features/stores/lib, shared contracts).

## Context

A mobile app in a second language and second architecture doubles every feature's cost and halves the team's shared context.

## Decision

Expo (managed workflow, OTA deliberately off per ADR 0056) with NativeWind, file-based routing mirroring web routes, and the same feature/store/lib shape consuming the same `@repo/contracts` and API client. Mobile mirrors primitives by hand (tokens only, never `@repo/ui` — DOM code can't cross the bridge).

## Consequences

Gain: one team, one language, one contract set; features land on both platforms from one design. Pay: native-specific needs (SecureStore, push, file picking) stay platform code, and the mirror requires discipline — drift between the twins is a maintenance smell to watch.

## Alternatives considered

- Flutter: rejected, second language and ecosystem for the whole team.
- Bare React Native CLI: rejected, native toolchain pain (Xcode/Gradle wrangling) with no product payoff at this size.
- PWA only: rejected, no store distribution and weaker native APIs (push, secure storage) than the product needs.
