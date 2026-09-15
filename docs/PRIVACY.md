# Privacy lifecycle foundation

The privacy module supplies reusable orchestration for data export and erasure. It is a technical
foundation, not a statement that every product is automatically compliant with a particular law.
Each product must define its legal basis, retention schedule, data inventory, holds, and response
process with qualified counsel.

## Data lifecycle boundary

Privacy does not import Notes, Files, Notifications, or future business modules. A module that owns
personal data registers a `DataLifecycleContributor` with a unique key and implements the operations
it supports:

- `exportSubject` returns bounded, machine-readable data and a `truncated` flag.
- `purgeSubject` removes data owned by one user after the erasure grace period.
- `purgeTenant` removes tenant-owned data after an organization grace period.

The current contributors are `notes`, `files`, and `notifications`. Notes is an example contributor
and is absent when `EXAMPLE_FEATURES_ENABLED=false`. Export payloads place contributor output under
`modules.<key>`, so adding a domain does not change the core privacy contract.

New modules holding personal data must register a contributor or document why retention and export
are governed elsewhere. Registration alone does not decide whether a business record may legally be
deleted. Preserve required records with tombstoned subject references and implement product policy in
the owning module.

## Export flow

1. `POST /privacy/export` applies explicit IP, actor, and tenant rate limits. The optional feature
   flag `admission.stop.privacy-exports` stops new export work during an incident.
2. The command takes a subject advisory lock, returns an existing active export when present, and
   commits one `REQUESTED` DSR plus a transactional `privacy.export.requested` outbox event.
3. The worker claims at most 10 requests each minute with `FOR UPDATE SKIP LOCKED`. Stale
   `PROCESSING` claims recover automatically. A request receives at most three attempts.
4. Reads run in short, explicit database transactions. Contributors paginate and cap their output.
   The complete JSON snapshot is capped at 5 MiB.
5. The final transaction stores the snapshot as `READY` or `PARTIAL`, sets a seven-day expiry, writes
   the critical mutation audit atomically, and emits `privacy.export.ready` through the outbox.
6. `GET /privacy/export/:id/download` is owner-only and accepts only unexpired `READY` or `PARTIAL`
   requests. Queued exports that do not finish within 24 hours expire without a snapshot.

`PARTIAL` is explicit and means at least one contributor reached its documented item cap. A failed
dependency does not silently produce a successful export.

## Erasure flow

Account erasure re-authenticates the subject, blocks deletion of a last organization owner, captures
the complete tenant plan, revokes sessions, increments `authVersion`, anonymizes the profile, removes
tenancy identity rows, and commits a 30-day `REQUESTED` DSR. Organization erasure requires the owner
and exact organization-name confirmation, then soft-deletes the organization and commits its plan.

The hourly purge worker claims at most 100 expired requests. It validates the persisted plan before
destructive work. Each lifecycle contributor performs idempotent deletion; S3 calls happen outside
rollback-capable SQL transactions, and progress/final status is committed in fresh transactions.
Malformed plans fail closed. This ordering avoids reporting a database rollback after irreversible
object deletion.

## Retention and operations

| Data                         | Default repository behavior                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Export request awaiting work | Expires after 24 hours                                                              |
| Export snapshot              | Available for 7 days, then payload is scrubbed                                      |
| Erasure grace                | 30 days, followed by bounded hourly purge                                           |
| Audit log                    | `AUDIT_RETENTION_DAYS`; deletion only through the restricted retention function     |
| Invitations                  | `INVITATION_RETENTION_DAYS`                                                         |
| Operation receipts           | Expiry-based bounded hourly cleanup                                                 |
| Database backups             | Newest `BACKUP_RETENTION_COUNT` local archives; cloud retention is deployment-owned |
| Logs and object versions     | Configure the production log backend and bucket lifecycle explicitly                |

Prometheus tracks export pending depth, oldest age, and failed depth. Alerts map to
[RB-19](runbooks/RB-19-privacy-export.md). Operators can stop intake with the feature flag while the
worker drains existing requests. Never log or attach export payloads to incident tickets.

## Verification

```bash
pnpm --filter api exec vitest run src/modules/privacy
pnpm db:migrate:lineage
pnpm db:migrate:check
```

A production release must also exercise export and erasure against a representative dataset, verify
object deletion, restore a matching database backup into an isolated environment, and confirm that
the restored release reapplies completed erasure before traffic is enabled.
