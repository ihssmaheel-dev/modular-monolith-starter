import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rate_limit";

export interface RateLimitMetadata {
  maxRequests: number;
  windowSeconds: number;
  failClosed?: boolean;
}

/**
 * Applies a custom rate limit to this endpoint.
 * @param maxRequests Maximum number of requests allowed in the window.
 * @param windowSeconds The time window in seconds.
 * @param failClosed Whether to reject requests if the backing Redis store is unavailable.
 */
export const RateLimit = (maxRequests: number, windowSeconds: number, failClosed?: boolean) =>
  SetMetadata(RATE_LIMIT_KEY, { maxRequests, windowSeconds, failClosed } as RateLimitMetadata);
