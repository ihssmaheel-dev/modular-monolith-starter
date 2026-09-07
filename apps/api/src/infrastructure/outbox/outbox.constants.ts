export const OUTBOX_QUEUE = "domain-events";
export const OUTBOX_MAX_ATTEMPTS = 5;
/** A crashed consumer must become claimable before the durable job is exhausted. */
export const OUTBOX_PROCESSING_TTL_SECONDS = 10 * 60;
export const OUTBOX_DEDUPE_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Machine codes for internal control flow — never user-facing, never i18n keys. */
export const OUTBOX_EVENT_IN_PROGRESS = "OUTBOX_EVENT_IN_PROGRESS";
export const OUTBOX_DURABLE_QUEUE_UNAVAILABLE = "OUTBOX_DURABLE_QUEUE_UNAVAILABLE";
