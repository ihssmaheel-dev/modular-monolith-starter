import { createHash, randomBytes } from "crypto";

/**
 * Generates a cryptographically secure random hexadecimal token.
 * Default length is 32 bytes (64 hex characters).
 */
export function generateSecureToken(length = 32): string {
  const tokenBytes = randomBytes(length);
  return tokenBytes.toString("hex");
}

/**
 * Computes a SHA-256 hash of a token for secure database storage and lookup.
 */
export function hashSha256Token(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
