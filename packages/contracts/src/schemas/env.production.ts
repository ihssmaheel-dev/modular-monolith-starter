import type { RefinementCtx } from "zod";
import type { EnvironmentForValidation } from "./env.refinement";

export function validateProductionEndpoints(
  env: EnvironmentForValidation,
  context: RefinementCtx,
): void {
  rejectPlaceholders(env, context);
  if (!isHttpsUrl(env.CLIENT_URL))
    addIssue(context, "CLIENT_URL", "CLIENT_URL must use HTTPS in production");
  if (!isHttpsUrl(env.API_URL))
    addIssue(context, "API_URL", "API_URL must use HTTPS in production");
  if (isLocalUrl(env.DATABASE_URL))
    addIssue(context, "DATABASE_URL", "Production database is required");
  if (!hasDatabaseTls(env.DATABASE_URL))
    addIssue(context, "DATABASE_URL", "DATABASE_URL must enable TLS in production");
  if (isLocalUrl(env.CLIENT_URL))
    addIssue(context, "CLIENT_URL", "Production client URL is required");
  if (isLocalUrl(env.API_URL)) addIssue(context, "API_URL", "Production API URL is required");
  if (env.S3_ENDPOINT && isLocalUrl(env.S3_ENDPOINT))
    addIssue(context, "S3_ENDPOINT", "Production storage endpoint is required");
  if (env.S3_ENDPOINT && !isHttpsUrl(env.S3_ENDPOINT))
    addIssue(context, "S3_ENDPOINT", "S3_ENDPOINT must use HTTPS in production");
  if (env.CDN_BASE_URL && isLocalUrl(env.CDN_BASE_URL))
    addIssue(context, "CDN_BASE_URL", "Production CDN endpoint is required");
  if (env.CDN_BASE_URL && !isHttpsUrl(env.CDN_BASE_URL))
    addIssue(context, "CDN_BASE_URL", "CDN_BASE_URL must use HTTPS in production");
  if (hasExampleHost(env.CLIENT_URL))
    addIssue(context, "CLIENT_URL", "CLIENT_URL must use a real production domain");
  if (hasExampleHost(env.API_URL))
    addIssue(context, "API_URL", "API_URL must use a real production domain");
  if (env.S3_ENDPOINT && hasExampleHost(env.S3_ENDPOINT))
    addIssue(context, "S3_ENDPOINT", "S3_ENDPOINT must use a real production domain");
  if (env.EMAIL_DRIVER === "resend" && !env.RESEND_API_KEY.trim()) {
    addIssue(context, "RESEND_API_KEY", "RESEND_API_KEY is required when EMAIL_DRIVER=resend");
  }
  if (env.EMAIL_DRIVER === "smtp" && isLocalHost(env.SMTP_HOST)) {
    addIssue(context, "SMTP_HOST", "Production SMTP host is required");
  }
  if (env.EMAIL_DRIVER === "smtp" && env.SMTP_PORT === 1025) {
    addIssue(context, "SMTP_PORT", "SMTP_PORT 1025 is reserved for local development");
  }
  if (env.REDIS_URL && !isRedissUrl(env.REDIS_URL)) {
    addIssue(context, "REDIS_URL", "REDIS_URL must use TLS in production");
  }
  if (env.FILE_AV_ENABLED && env.FILE_AV_URL && isLocalUrl(env.FILE_AV_URL)) {
    addIssue(context, "FILE_AV_URL", "Production antivirus endpoint is required");
  }
  if (hasExampleEmailDomain(env.EMAIL_FROM))
    addIssue(context, "EMAIL_FROM", "EMAIL_FROM must use a verified production domain");
  if (!env.S3_BUCKET.trim() || !env.S3_REGION.trim()) {
    addIssue(context, "S3_BUCKET", "Production storage bucket and region are required");
  }
}

function rejectPlaceholders(env: EnvironmentForValidation, context: RefinementCtx): void {
  const values: Array<[keyof EnvironmentForValidation, string | undefined]> = [
    ["JWT_SECRET", env.JWT_SECRET],
    ["JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET],
    ["METRICS_TOKEN", env.METRICS_TOKEN],
    ["ERROR_REPORTING_TOKEN", env.ERROR_REPORTING_TOKEN],
    ["DATABASE_URL", env.DATABASE_URL],
    ["REDIS_URL", env.REDIS_URL],
    ["S3_ACCESS_KEY_ID", env.S3_ACCESS_KEY_ID],
    ["S3_SECRET_ACCESS_KEY", env.S3_SECRET_ACCESS_KEY],
    ["CLIENT_URL", env.CLIENT_URL],
    ["API_URL", env.API_URL],
    ["S3_ENDPOINT", env.S3_ENDPOINT],
    ["EMAIL_FROM", env.EMAIL_FROM],
    ["SMTP_HOST", env.SMTP_HOST],
  ];
  for (const [key, value] of values) {
    if (value && PLACEHOLDER_PATTERN.test(value)) {
      addIssue(context, String(key), `${String(key)} must be replaced in production`);
    }
  }
}

function addIssue(context: RefinementCtx, path: string, message: string): void {
  context.addIssue({ code: "custom", path: [path], message });
}

function isLocalUrl(value: string): boolean {
  try {
    return isLocalHost(new URL(value).hostname);
  } catch {
    return true;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hasDatabaseTls(value: string): boolean {
  try {
    const url = new URL(value);
    const sslmode = url.searchParams.get("sslmode");
    return ["require", "verify-ca", "verify-full"].includes(sslmode ?? "");
  } catch {
    return false;
  }
}

function isRedissUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "rediss:";
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}

function hasExampleHost(value: string): boolean {
  try {
    return EXAMPLE_DOMAIN_PATTERN.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function hasExampleEmailDomain(value: string): boolean {
  const domain = value.split("@")[1];
  return Boolean(domain && EXAMPLE_DOMAIN_PATTERN.test(domain));
}

const PLACEHOLDER_PATTERN =
  /replace[-_ ]with|change[-_ ]me|your[-_ ](?:super[-_ ])?secret|<[^>]+>/i;
const EXAMPLE_DOMAIN_PATTERN = /(?:^|\.)example\.(?:com|org|net)$/i;
