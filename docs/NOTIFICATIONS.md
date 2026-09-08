# Notifications — Center, Preferences, Fan-Out

One domain owns every notification. Features dispatch domain events; they never
send email, push, or realtime messages directly.

## Flow

```
Feature command → outbox.dispatch("<domain>.<event>")
  → OutboxEventWorker → DomainEventFanoutListener
  → SendNotificationCommand (THE single entry point)
    1. validate recipient + resolve preferences (seeded defaults on first use)
    2. persist center row + outbox event in one transaction
       (notification.created now, digest.ready when its window closes)
    3. after commit: deliver on enabled channels (realtime, email, push)
```

## Channels (ports, swappable)

| Channel | Transport                                                                   | Notes                                                                                                                              |
| ------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| In-app  | `RealtimeService.sendToUser` (Redis stream → WS/SSE)                        | Live badge + feed invalidation; works offline-first via center rows                                                                |
| Email   | `EmailService.send` (circuit breaker + per-tenant bulkhead)                 | `NotificationDigestEmail` tiered rendering (1–3 detail, 4–10 headlines, 11+ count)                                                 |
| Push    | `PushDriver` port → `ExpoPushDriver` (`PUSH_PROVIDER=expo`, default `none`) | Title/body + `{userId, tenantId}` data; receipts polled, dead tokens pruned inline; swap to FCM-direct without touching call sites |

Push titles render in the API default locale for v1; per-user locale is a
follow-up requiring a stored locale on users.

## Types registry (`@repo/contracts` NOTIFICATION_TYPES)

| Type                          | Category      | Channels                                                       | Batching                                    |
| ----------------------------- | ------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `user.welcome`                | account       | in-app                                                         | immediate                                   |
| `tenancy.invitation.received` | workspace     | in-app, push (critical; email already sent by invitation flow) | immediate                                   |
| `privacy.export.ready`        | privacy       | in-app, push (critical)                                        | immediate                                   |
| `note.activity`               | collaboration | in-app, email                                                  | 60-min entity windows, hourly/daily cadence |

To notify on a new event: add a registry entry + a fan-out handler + titleKey
strings. Critical alerts must bypass batching — configure it on the type, not
in code.

## Digest rules

- Batch-on-write windows keyed `(userId, type, entityId|none)`; work happens
  first, then an atomic `open → delivered` claim, and a replica that loses the
  claim deletes its duplicate row — exactly one visible digest row.
- One digest = one center row + one email + one count-only push. Items capped at
  `NOTIFICATION_DIGEST_MAX_ITEMS` (retains latest).
- `DigestWorker` runs every minute (`PROCESS_ROLE !== api`); empty windows close
  uncounted.

## Preferences

Per user×category rows (`inApp/email/push`, `digestCadence`). Defaults seeded
from the registry on first send or first settings visit. Self-service UI in
Settings on web and mobile; changes apply to future sends immediately.

## Devices

`register-device` upserts Expo tokens (`ExponentPushToken[…]` validated);
tap-through routes by type (`invitation → accept-invitation`, `export →
settings`, `noteId → note detail`). `DeviceNotRegistered` tokens are deleted
inline during fan-out.

## Clients

- Web: header bell (unread badge + recent dropdown), `/notifications` feed,
  preferences card, SSE hook (`useRealtimeNotifications`) invalidating
  `["notifications"]`. No `fetch` outside `getApiClient()`.
- Mobile: `expo-notifications` (permissions, foreground handler, badge),
  `PushBootstrap` (token registration + tap routing + invalidation),
  `(tabs)/notifications` feed, settings preferences card.
- Query keys are user-scoped (`["notifications", …]`); logout clears them.

## Privacy & ops

- Erasure: `PurgeUserNotificationsCommand` (account, also called at grace
  fulfillment) and `purgeTenant` (organization; preferences and device tokens
  are account-scoped and survive org erasure by design); export manifest
  includes preferences, inbox rows, device manifests, and batch manifests.
- RLS: all four tables enforce `subject_isolation_*` policies; repositories
  carry `subject-scoped:` markers instead of tenant scoping.
- Metrics: `notifications_digest_delivered_total`, existing outbox/email gauges.
- Env: `PUSH_PROVIDER=none|expo`, `EXPO_ACCESS_TOKEN?`, `NOTIFICATION_DIGEST_MAX_ITEMS`.

## Verification

```bash
pnpm --filter api exec vitest run src/modules/notifications
pnpm --filter api db:migrate:check
```
