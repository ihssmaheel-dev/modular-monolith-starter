# Privacy — GDPR Export & Erasure

How this monolith honors data-subject rights: export-my-data (Art. 15/20) and
erasure (Art. 17) for accounts and organizations.

## Data inventory (Art. 30 RoPA draft)

| Store                           | Personal data                               | Erasure handling                                                                                                                                                               |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`                         | email, name, password/reset hashes, role    | Anonymized immediately (`deleted+{id}@deleted.local` / `Deleted User`, secrets cleared, `authVersion` bumped); row hard-deleted after 30-day grace                             |
| `memberships`                   | userEmail, userName (denormalized snapshot) | Deleted with the account; synced from anonymized profile via `user.updated`                                                                                                    |
| `invitations`                   | email, invitedBy, acceptedBy                | Deleted by subject email on account erasure; all deleted on org erasure                                                                                                        |
| `notes`                         | title, content, createdBy                   | Hard-deleted per subject (account) or per tenant (org)                                                                                                                         |
| `files` + S3                    | fileName, uploadedBy, object bytes          | S3 object deleted first, then row; orphans reconciled by `FileReconciliationWorker`                                                                                            |
| Redis sessions/tokens           | userId, ip, userAgent, deviceName, jti      | `revokeAllForUser` immediately on erasure request                                                                                                                              |
| `outbox_events` payloads        | May carry emails/titles while PENDING       | Relayed payloads are immutable; pending subject payloads are consumed before purge                                                                                             |
| `audit_logs` before/after       | May carry emails/names (immutable trigger)  | **Retained** under Art. 17(3)(b)/(e) (legal obligation / legal claims) with `purge_audit_logs_older_than` retention; new privacy events carry ids/statuses only, never raw PII |
| Email jobs                      | to/subject/html                             | Transient BullMQ payloads with retries; no local archive                                                                                                                       |
| Backups (`pg_dump` gz)          | Full snapshot                               | Age out via `BACKUP_RETENTION_COUNT`; a restore must run the erasure purge before going live                                                                                   |
| Cache (`user:{id}`, query keys) | Profile copies                              | Invalidated on erase; TTL-bounded otherwise                                                                                                                                    |
| Logs (Pino/Loki)                | userId/email fields                         | Operational logs; Loki retention applies                                                                                                                                       |

## Flows

- **Export**: `POST /privacy/export` (rate-limited) → snapshot (profile, memberships,
  invitations, **own** notes across all pages/tenants up to 1000, own file manifests up to
  1000, `truncated` flag when capped) stored on the DSR, `READY` for 7 days →
  `GET /privacy/export/:id/download` (**owner-only**, even for admins; stale snapshots
  are scrubbed nightly by `PurgeExpiredErasuresCommand`).
- **Delete account**: `POST /privacy/erase-account {password}` (password re-auth,
  rate-limited) → sole-ownership check first (last remaining owner is blocked with
  `409 ownsOrganization` until ownership is transferred) → sessions revoked + tokens
  invalidated now, profile anonymized now, tenancy/notes/files purged now,
  DSR `REQUESTED` with 30-day grace → nightly `PurgeExpiredErasuresCommand`
  hard-deletes the user row and marks `FULFILLED`. One pending request per subject.
- **Delete organization**: `POST /privacy/organizations/:id/erase {confirmationName}`
  (owner only, exact name match) → tenant notes/files/memberships/invitations purged now,
  org soft-deleted now, shell hard-deleted after grace.
- **Admin**: `GET /privacy/admin/requests` (`privacy:requests:read`) for the Art. 12(3)
  one-month clock; `POST /privacy/admin/purge-expired` triggers the worker on demand.
- Self-service UI lives in Settings on web (`ExportCard`, `EraseAccountCard`,
  `EraseOrganizationCard`) and mobile (privacy card).

## Retention schedule

| Data                           | Retention                                                |
| ------------------------------ | -------------------------------------------------------- |
| Export snapshots (DSR payload) | 7 days (`EXPIRED`, payload scrubbed)                     |
| Erasure grace                  | 30 days, then hard-delete                                |
| Audit logs                     | `AUDIT_RETENTION_DAYS` via `purge_audit_logs_older_than` |
| Backups                        | `BACKUP_RETENTION_COUNT` archives                        |
| Sessions/tokens                | TTL + immediate revoke on erase/logout                   |

## Verification

```bash
pnpm --filter api db:migrate:check   # fresh + upgrade, incl. dsr_requests
pnpm --filter api test:unit          # privacy + anonymize suites
```

New-product checklist: every new module holding personal data must add a purge path
and register it in the erasure orchestrators, or document why it is out of scope.
