import type { FastifyReply } from "fastify";
import { API_ROOT_PATH } from "@repo/contracts";
import { parseDurationToSeconds } from "../../../../common/utils/duration.utils";
import { env } from "../../../../config/env";

// Cookie lifetimes derive from the same JWT expiry configuration as the
// tokens and Redis TTLs — never hardcoded separately.
const ACCESS_TOKEN_MAX_AGE = parseDurationToSeconds(env.JWT_EXPIRES_IN);
const REFRESH_TOKEN_MAX_AGE = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
// Keep auth cookies at the API root so a future /api/v2 surface can reuse a session.
const AUTH_COOKIE_PATH = API_ROOT_PATH;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  // Lax (not Strict): session cookies must be present on top-level
  // navigation (email links, same-site subdomains) so the app boots
  // authenticated; cross-site mutation CSRF is still blocked by the
  // double-submit CsrfGuard.
  sameSite: "lax" as const,
};

export function setAccessTokenCookie(reply: FastifyReply, token: string): void {
  reply.setCookie("access_token", token, {
    ...COOKIE_OPTIONS,
    path: AUTH_COOKIE_PATH,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
}

export function setRefreshTokenCookie(reply: FastifyReply, token: string): void {
  reply.setCookie("refresh_token", token, {
    ...COOKIE_OPTIONS,
    path: AUTH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
): void {
  setAccessTokenCookie(reply, accessToken);
  setRefreshTokenCookie(reply, refreshToken);
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie("access_token", { ...COOKIE_OPTIONS, path: AUTH_COOKIE_PATH });
  reply.clearCookie("refresh_token", { ...COOKIE_OPTIONS, path: AUTH_COOKIE_PATH });
}
