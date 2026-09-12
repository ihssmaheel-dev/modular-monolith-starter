import type { JwtPayload } from "jsonwebtoken";
import type { AuthenticatedUser } from "@repo/contracts";
import { env } from "../../config/env";
import { getJwtKeyring, verifyJwtWithKeyring } from "../../infrastructure/security/jwt-keyring";

export function verifyAccessToken(token: string): AuthenticatedUser | null {
  const decoded = verifyJwtWithKeyring(token, getJwtKeyring("access"), {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  return decoded && isAuthenticatedUser(decoded) ? decoded : null;
}

/**
 * Reads the expiry claim without verifying: sweep timing only, never an
 * authentication decision. Authentication always goes through
 * verifyAccessToken; this just tells the connection sweeper when to
 * re-check (or drop) a long-lived socket.
 */
export function decodeAccessTokenExpiry(token: string): number | null {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isAuthenticatedUser(value: JwtPayload): value is AuthenticatedUser {
  return (
    typeof value.sub === "string" &&
    typeof value.email === "string" &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.role === "admin" || value.role === "user") &&
    (value.authVersion === undefined || typeof value.authVersion === "number")
  );
}
