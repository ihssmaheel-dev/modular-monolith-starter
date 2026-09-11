# 0035. Changesets for versioned releases

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from the changesets config in a pnpm workspace with independently consumable packages.

## Context

A monorepo with shared packages needs per-package versioning and changelogs, or releases become "bump everything and hope" with release notes written from memory.

## Decision

Changesets: each PR adds a changeset file declaring patch/minor/major per affected package with a human-written summary; releases consume them into versions plus changelogs.

## Consequences

Gain: versions and changelogs write themselves from PR-time intent; consumers see exactly what changed per package. Pay: contributors must remember the changeset file (PR template reminds them), and neglected changesets produce empty releases.

## Alternatives considered

- Manual CHANGELOG edits: rejected, rots within months and merges conflict constantly.
- Fully automated semantic-release: rejected, derives versions from commit messages alone with no room for human judgment on what changed meaningfully.
