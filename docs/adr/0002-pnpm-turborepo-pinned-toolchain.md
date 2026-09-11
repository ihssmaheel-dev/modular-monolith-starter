# 0002. pnpm + Turborepo + a pinned toolchain

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from `pnpm-workspace.yaml`, `packageManager`, corepack docs, and the turbo pipeline.

## Context

Monorepos die by slow installs, phantom dependencies, and "works on my machine" toolchain drift across Node and package-manager versions.

## Decision

pnpm 10 workspaces (content-addressed store, strict `node_modules` so phantom imports fail instead of silently working), Turborepo 2.10 pipelines with caching, `packageManager` + corepack pinning, and `engines` requiring Node 20.19+ (the floor oRPC's ESM runtime needs).

## Consequences

Gain: fast installs, reproducible environments, remote-cacheable CI. Pay: contributors must use corepack pnpm (one setup step), and store quirks occasionally surprise npm-trained developers.

## Alternatives considered

- npm workspaces: rejected, hoisted `node_modules` hides missing declarations until production.
- Yarn/Nx: no decisive advantage over pnpm+turbo for this shape; switching would churn every script for fashion.
- Unpinned toolchain: rejected, guarantees environment drift across machines and CI.
