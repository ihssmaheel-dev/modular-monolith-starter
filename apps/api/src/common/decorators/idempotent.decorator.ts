import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_KEY = "isIdempotent";

/**
 * Marks an endpoint as requiring an Idempotency-Key header.
 * Best-effort transport replay protection backed by Redis. Business operations
 * that require crash-proof deduplication must also persist their operation key
 * in the same database transaction as the mutation.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
