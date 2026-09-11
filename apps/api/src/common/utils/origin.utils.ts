import { env } from "../../config/env";

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Browser origins the API trusts, derived from one source (CLIENT_URL).
 * A comma-separated CLIENT_URL configures several trusted origins. Every
 * CORS/Origin/WebSocket check must use these helpers instead of parsing
 * CLIENT_URL (or hardcoding localhost ports) on its own.
 */
export function clientOrigins(): string[] {
  return env.CLIENT_URL.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Single trust rule for browser origins. Configured origins always pass;
 * outside production any loopback origin passes (local dev across ports).
 */
export function isTrustedOrigin(
  origin: string,
  production = env.NODE_ENV === "production",
): boolean {
  if (!origin) return true;
  if (clientOrigins().includes(origin)) return true;
  return !production && LOOPBACK_ORIGIN.test(origin);
}

/**
 * Host variant of isTrustedOrigin for Referer checks. Compares hosts
 * scheme-agnostically: a Referer host carries no scheme, while configured
 * origins may use https.
 */
export function isTrustedHost(host: string, production = env.NODE_ENV === "production"): boolean {
  const configured = new Set<string>();
  for (const origin of clientOrigins()) {
    try {
      configured.add(new URL(origin).host.toLowerCase());
    } catch {
      continue;
    }
  }
  const candidate = host.toLowerCase();
  if (configured.has(candidate)) return true;
  if (production) return false;
  const name = candidate.split(":")[0];
  return name === "localhost" || name === "127.0.0.1";
}
