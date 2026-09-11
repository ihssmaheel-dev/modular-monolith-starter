# 0019. `@repo/contracts` as the single source of truth

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** contracts
- **Backfilled:** yes — reconstructed from the package layout (schemas, contracts, types, constants) and its consumers on every layer.

## Context

API shapes, validation rules, error codes, and env schemas drift apart the moment each layer defines its own: the classic "works in Postman, breaks in the app" class of bugs.

## Decision

One package owns it all: Zod 4 schemas and DTOs, oRPC route contracts, shared types, error/pagination constants, and env schemas for API, web, and mobile. Backend validates with them, frontends build forms with them (`zodResolver`), clients are generated from them. Duplicating a schema or type elsewhere is a rule violation, not a shortcut.

## Consequences

Gain: drift becomes a compile error instead of a production mystery; one edit propagates to validation, forms, clients, and docs. Pay: the package is a change hotspot (versioned carefully), and cross-cutting edits need awareness of all consumers.

## Alternatives considered

- Per-layer types: rejected, the drift factory — every boundary becomes a translation layer that rots.
- Codegen from OpenAPI: rejected, generates code nobody owns and everyone fears editing; handwritten Zod stays readable.
