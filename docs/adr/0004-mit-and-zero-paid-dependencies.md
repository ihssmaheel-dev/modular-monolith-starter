# 0004. MIT license and zero paid or proprietary dependencies

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** quality
- **Backfilled:** yes — reconstructed from the MIT license and the locked-stack rule stating no paid services or proprietary dependencies, no exceptions.

## Context

A starter dies commercially if adopting it means licensing audits, per-seat bills, or features that phone home. Enterprise and on-prem users ask about this on the first call.

## Decision

MIT license. Every dependency must be free and open source — no paid tiers, no community-edition bait, no proprietary SDKs in the critical path. `PACKAGE_POLICY.md` enforces it per addition with audit checks; the single sanctioned exception (Expo push, ADR 0055) is documented, not smuggled.

## Consequences

Gain: adoptable anywhere including air-gapped on-prem; no license traps for downstream products. Pay: occasionally building small things in-house instead of buying (accepted deliberately), and eternal vigilance on new dependencies.

## Alternatives considered

- Copyleft license (GPL/AGPL): rejected, would infect downstream products and kill starter adoption.
- Paid-best-of-breed services: rejected one by one, would price out indie users and block on-prem entirely.
