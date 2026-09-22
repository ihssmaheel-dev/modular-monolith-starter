const POLICY_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
] as const;

const VALID_NONCE = /^[a-f0-9]{32}$/;

export function buildDocumentCsp(nonce: string, apiBaseUrl: string): string {
  if (!VALID_NONCE.test(nonce)) {
    throw new Error("Invalid server-generated CSP nonce");
  }

  const apiSource = apiBaseUrl.startsWith("/") ? undefined : new URL(apiBaseUrl).origin;
  const connectSources = ["'self'", "ws:", "wss:", "https:", apiSource]
    .filter((source): source is string => Boolean(source))
    .join(" ");

  return [
    ...POLICY_DIRECTIVES,
    `connect-src ${connectSources}`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
  ].join("; ");
}
