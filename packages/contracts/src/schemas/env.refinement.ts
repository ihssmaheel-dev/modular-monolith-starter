import type { RefinementCtx } from "zod";
import { validateProductionEndpoints } from "./env.production";

export const DEFAULT_JWT_SECRET = "your-super-secret-jwt-key-change-in-prod";
export const DEFAULT_REFRESH_SECRET = "your-super-secret-refresh-key-change-in-prod";

export type EnvironmentForValidation = {
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_SIGNING_KEYS?: Record<string, string>;
  JWT_REFRESH_SIGNING_KEYS?: Record<string, string>;
  JWT_ACTIVE_KEY_ID: string;
  JWT_REFRESH_ACTIVE_KEY_ID: string;
  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;
  FILE_AV_ENABLED: boolean;
  FILE_AV_URL?: string;
  IDEMPOTENCY_STALE_AFTER_SECONDS: number;
  IDEMPOTENCY_PROCESSING_TTL_SECONDS: number;
  NODE_ENV: "development" | "test" | "production";
  REDIS_URL?: string;
  METRICS_TOKEN?: string;
  ERROR_REPORTING_URL?: string;
  ERROR_REPORTING_TOKEN?: string;
  STORAGE_DRIVER: "s3";
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  DATABASE_URL: string;
  CLIENT_URL: string;
  API_URL: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_BUCKET: string;
  CDN_ENABLED: boolean;
  CDN_DOMAIN?: string;
  EMAIL_DRIVER: "smtp" | "resend";
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  AUDIT_RETENTION_DAYS: number;
  PUSH_PROVIDER: "none" | "expo";
  EXPO_ACCESS_TOKEN?: string;
};

export function validateEnvironment(env: EnvironmentForValidation, context: RefinementCtx): void {
  validateActiveKey(env.JWT_SIGNING_KEYS, env.JWT_ACTIVE_KEY_ID, "JWT_ACTIVE_KEY_ID", context);
  validateActiveKey(
    env.JWT_REFRESH_SIGNING_KEYS,
    env.JWT_REFRESH_ACTIVE_KEY_ID,
    "JWT_REFRESH_ACTIVE_KEY_ID",
    context,
  );
  if (activeSecret(env, false) === activeSecret(env, true)) {
    context.addIssue({
      code: "custom",
      path: ["JWT_REFRESH_SECRET"],
      message: "JWT secrets must differ",
    });
  }
  if (Boolean(env.SEED_ADMIN_EMAIL) !== Boolean(env.SEED_ADMIN_PASSWORD)) {
    context.addIssue({
      code: "custom",
      path: ["SEED_ADMIN_PASSWORD"],
      message: "Seed credentials must be set together",
    });
  }
  if (env.FILE_AV_ENABLED && !env.FILE_AV_URL) {
    context.addIssue({
      code: "custom",
      path: ["FILE_AV_URL"],
      message: "FILE_AV_URL is required when scanning is enabled",
    });
  }
  if (env.PUSH_PROVIDER === "expo" && !env.EXPO_ACCESS_TOKEN) {
    context.addIssue({
      code: "custom",
      path: ["EXPO_ACCESS_TOKEN"],
      message: "EXPO_ACCESS_TOKEN is required for Expo push (tokenless sends are rate-limited)",
    });
  }
  if (env.IDEMPOTENCY_STALE_AFTER_SECONDS >= env.IDEMPOTENCY_PROCESSING_TTL_SECONDS) {
    context.addIssue({
      code: "custom",
      path: ["IDEMPOTENCY_STALE_AFTER_SECONDS"],
      message: "Stale age must be less than processing TTL",
    });
  }
  if (env.NODE_ENV !== "production") return;
  if (!env.REDIS_URL)
    context.addIssue({
      code: "custom",
      path: ["REDIS_URL"],
      message: "REDIS_URL is required in production",
    });
  if (!env.METRICS_TOKEN)
    context.addIssue({
      code: "custom",
      path: ["METRICS_TOKEN"],
      message: "METRICS_TOKEN is required in production",
    });
  if (env.ERROR_REPORTING_URL && !isHttpsUrl(env.ERROR_REPORTING_URL)) {
    context.addIssue({
      code: "custom",
      path: ["ERROR_REPORTING_URL"],
      message: "ERROR_REPORTING_URL must use HTTPS in production",
    });
  }
  if (env.JWT_SECRET === DEFAULT_JWT_SECRET || env.JWT_SECRET.includes("change-in-prod")) {
    context.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "JWT_SECRET must be unique in production",
    });
  }
  if (
    env.JWT_REFRESH_SECRET === DEFAULT_REFRESH_SECRET ||
    env.JWT_REFRESH_SECRET.includes("change-in-prod")
  ) {
    context.addIssue({
      code: "custom",
      path: ["JWT_REFRESH_SECRET"],
      message: "JWT_REFRESH_SECRET must be unique in production",
    });
  }
  if (
    env.STORAGE_DRIVER === "s3" &&
    (env.S3_ACCESS_KEY_ID === "minioadmin" || env.S3_SECRET_ACCESS_KEY === "minioadmin")
  ) {
    context.addIssue({
      code: "custom",
      path: ["S3_ACCESS_KEY_ID"],
      message: "S3 credentials must not use defaults in production",
    });
  }
  validateProductionEndpoints(env, context);
}

function validateActiveKey(
  keyring: Record<string, string> | undefined,
  activeKeyId: string,
  path: string,
  context: RefinementCtx,
): void {
  if (keyring && !keyring[activeKeyId]) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: `${path} must reference a configured signing key`,
    });
  }
}

function activeSecret(env: EnvironmentForValidation, refresh: boolean): string {
  const keyring = refresh ? env.JWT_REFRESH_SIGNING_KEYS : env.JWT_SIGNING_KEYS;
  const activeKeyId = refresh ? env.JWT_REFRESH_ACTIVE_KEY_ID : env.JWT_ACTIVE_KEY_ID;
  const fallback = refresh ? env.JWT_REFRESH_SECRET : env.JWT_SECRET;
  return keyring?.[activeKeyId] ?? fallback;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
