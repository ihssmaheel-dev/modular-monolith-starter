import { RateLimit } from "../../../common";

const AUTH_LIMITS = {
  register: { requests: 5, seconds: 60 },
  login: { requests: 10, seconds: 60 },
  refresh: { requests: 30, seconds: 60 },
  forgotPassword: { requests: 3, seconds: 15 * 60 },
  resetPassword: { requests: 5, seconds: 15 * 60 },
  verifyEmail: { requests: 10, seconds: 60 },
  resendVerification: { requests: 3, seconds: 15 * 60 },
} as const;

export type AuthRateLimitType = keyof typeof AUTH_LIMITS;

export function AuthRateLimit(type: AuthRateLimitType) {
  const limit = AUTH_LIMITS[type];
  return RateLimit(limit.requests, limit.seconds);
}
