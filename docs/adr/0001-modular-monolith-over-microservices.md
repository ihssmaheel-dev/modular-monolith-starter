# 0001. Modular monolith over microservices

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the module layout, `MODULE_RULES.md`, and the dependency-cruiser boundaries; the shape predates this record.

## Context

One product, one team, many domains (auth, notes, files, notifications, privacy, tenancy). Microservices would charge distributed-systems tax — versioned APIs between own modules, distributed transactions, multi-service deploys — before the product earned it.

## Decision

A single NestJS deployable with hard module boundaries: `apps/api/src/modules/[domain]/` in presentation/application/domain/infrastructure layers, cross-module imports policed by `rules:check` and dependency-cruiser.

## Consequences

Gain: one deploy, real database transactions across domains, fearless cross-module refactors, one observability stack. Pay: boundaries are conventional, not physical — a lazy import can rot them (hence the automated gate), and scaling means replicating the whole API until a module provably deserves extraction.

## Alternatives considered

- Microservices from day one: rejected, ops cost with no scaling evidence.
- Unstructured monolith: rejected, becomes unmaintainable past a handful of domains; the module rules exist to prevent exactly this.
