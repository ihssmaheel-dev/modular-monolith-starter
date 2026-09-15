const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /password|secret|token|authorization|cookie|credential|private.?key/i;
const MAX_DEPTH = 12;

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return "[DEPTH_LIMIT]";
  if (Array.isArray(value)) return value.map((item) => redactAuditValue(item, depth + 1));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactAuditValue(item, depth + 1),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
