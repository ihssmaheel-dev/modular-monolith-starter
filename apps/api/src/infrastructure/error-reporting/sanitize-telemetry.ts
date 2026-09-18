export function sanitizeErrorText(value: string, maxLength?: number): string;
export function sanitizeErrorText(value: undefined, maxLength?: number): undefined;
export function sanitizeErrorText(
  value: string | undefined,
  maxLength?: number,
): string | undefined;
export function sanitizeErrorText(value: string | undefined, maxLength = 2000): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value
    .slice(0, maxLength)
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [REDACTED]")
    .replace(/((?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(?:postgres(?:ql)?|redis(?:s)?):\/\/[^\s]+/gi, "[REDACTED_CONNECTION_URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}

export function sanitizeClientUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl, "http://localhost");
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/token|secret|key|auth|pass|code|cred/i.test(key)) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl.replace(/((?:token|secret|key|auth|pass|code)=)[^&]+/gi, "$1[REDACTED]");
  }
}
