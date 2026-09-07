# Notifications — Center, Preferences, Fan-Out

One domain owns every notification. Features dispatch domain events; they never
send email, push, or realtime messages directly.

## Flow

```
Feature command → outbox.dispatch("<domain>.<event>")
  → OutboxEventWorker → DomainEventFanoutListener
  → SendNotificationCommand (THE single entry point)
    1. persist center row (notifications table)
    2. load preferences (seeded defaults on first use)
    3. critical or realtime cadence → deliver now on enabled channels
       else batch-on-write into (user, type, entity) window
    4. transactional outbox event (notification.created / digest.ready)
```

## Channels (ports, swappable)

| Channel | Transport                                                                   | Notes                                                                                          |
| ------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| In-app  | `RealtimeService.sendToUser` (Redis stream → WS/SSE)                        | Live badge + feed invalidation; works offline-first via center rows                            |
| Email   | `EmailService.send` (circuit breaker + bulkhead)                            | `NotificationDigestEmail` tiered rendering (1–3 detail, 4–10 headlines, 11+ count)             |
| Push    | `PushDriver` port → `ExpoPushDriver` (`PUSH_PROVIDER=expo`, default `none`) | Count-only payloads; dead tokens pruned inline; swap to FCM-direct without touching call sites |

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

- Batch-on-write windows keyed `(userId, type, entityId|none)`; atomic claim via
  `updateOne({id, status: open})` so concurrent workers never double-deliver.
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

- Erasure: `PurgeUserNotificationsCommand` (account) and `purgeTenant`
  (organization) are called by the privacy erasure flow; export manifest
  includes preferences.
- Metrics: `notifications_digest_delivered_total`, existing outbox/email gauges.
- Env: `PUSH_PROVIDER=none|expo`, `EXPO_ACCESS_TOKEN?`, `NOTIFICATION_DIGEST_MAX_ITEMS`.

## Verification

```bash
pnpm --filter api exec vitest run src/modules/notifications
pnpm --filter api db:migrate:check
```
