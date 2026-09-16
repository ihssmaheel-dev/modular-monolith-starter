# Production Starter Hardening — 2026-09-16

This document records the hardening changes made after the production-starter re-audit. The older
reports remain historical findings; they must not be used as the current implementation reference.

## Implemented

- Ownership authorization is now explicit-action only. The reusable policy helper requires a resource
  type and an action list; no generic `owner + action:*` grant remains.
- Durable operation receipts now protect outbox event consumption when the database idempotency
  module is available. Claims are leased, completed after listeners succeed, released after failure,
  and reset during dead-letter replay. Redis remains a fallback marker for isolated worker tests or
  installations that omit the idempotency module.
- Repository updates now expose `updateByIdWithVersion`, an atomic optimistic-concurrency path that
  returns `CONFLICT` when the row changed since it was read.
- Queue shutdown now has a bounded close deadline so a stuck worker cannot hold a deployment open
  indefinitely.
- Long ambient HTTP transactions emit a structured warning when they exceed the short-work budget.
  Existing external-I/O routes continue to use `@NoDatabaseTransaction`; new commands should own
  explicit short transactions.
- Organization erasure retains a tombstone instead of physically deleting the organization shell.
  Historical references remain stable and future ledger/audit foreign keys are not destroyed.
- Module scaffolding no longer creates a README in a module root, which keeps generated structure
  aligned with the module placement rules.

## Verification

The branch was verified with API typechecking, targeted authorization/outbox/database/transaction
tests, and the repository's generator and rules checks. Full CI should still run integration, E2E,
database migration, backup/restore, and deployment validation before release.

## Deployment responsibilities

Cloud cost and availability still depend on deployment policy. Production environments must configure
S3 lifecycle rules, Redis memory/eviction limits, telemetry retention and sampling, database backups
with restore drills, trusted ingress boundaries, cloud budget alarms, and an immutable image
promotion/rollback process.
