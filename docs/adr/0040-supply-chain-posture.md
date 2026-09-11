# 0040. Supply-chain posture: scanning, ownership, automation

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from Gitleaks config, Dependabot, CODEOWNERS, `security.yml`, and the `PACKAGE_POLICY.md` audit rule.

## Context

Most breaches ride in through dependencies or leaked secrets, not through application logic. Catching that needs automation, not vigilance.

## Decision

Four layers, all in-repo: Gitleaks blocks secret commits; Dependabot proposes updates on schedule; CODEOWNERS routes sensitive paths to required reviewers; `security.yml` runs vulnerability scanning in CI. `PACKAGE_POLICY.md` adds the human gate — every new dependency is justified, free/OSS-only, and `pnpm audit`-checked.

## Consequences

Gain: supply-chain issues surface as PRs and failing checks instead of incidents. Pay: alert triage toil (Dependabot noise) and occasional forced upgrades when advisories land.

## Alternatives considered

- Ad-hoc updates when someone remembers: rejected, proven to drift into years-old vulnerable trees.
- Commercial SCA platform: rejected while free tooling covers the need; revisit if compliance demands attestations we can't generate.
