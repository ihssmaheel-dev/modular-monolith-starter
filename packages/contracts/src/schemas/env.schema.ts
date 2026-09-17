import { z } from "zod";
import { DEFAULT_JWT_SECRET, DEFAULT_REFRESH_SECRET, validateEnvironment } from "./env.refinement";

const MAX_PORT = 65_535;
const MAX_POOL_SIZE = 200;
const JWT_KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const jwtKeyringSchema = z.record(
  z.string().regex(JWT_KEY_ID_PATTERN, "JWT key IDs must use letters, numbers, ., _, or -"),
  z.string().min(32),
);

function parseJsonKeyring(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function emptyStringAsUndefined(value: unknown): unknown {
  return value === "" ? undefined : value;
}

function parseEnvironmentBoolean(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return value;
}

function environmentBoolean(defaultValue: boolean) {
  return z.preprocess(parseEnvironmentBoolean, z.boolean()).default(defaultValue);
}

function isFeatureFlagsJson(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((flag) => typeof flag === "boolean")
    );
  } catch {
    return false;
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_NAME: z.string().trim().min(2).max(64).default("Workspace"),
    APP_SLUG: z
      .string()
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "APP_SLUG must use lowercase kebab-case")
      .default("modular-monolith"),
    PROCESS_ROLE: z.enum(["all", "api", "worker"]).default("all"),
    EXAMPLE_FEATURES_ENABLED: environmentBoolean(false),
    PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(5156),
    TRUST_PROXY: environmentBoolean(false),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
    CLIENT_URL: z.string().url().default("http://localhost:5155"),

    API_URL: z.string().url().default("http://localhost:5156"),

    DATABASE_URL: z.string().url().default("postgres://postgres:postgres@127.0.0.1:5432/app"),
    DB_DIRECT_URL: z
      .string()
      .url()
      .optional()
      .describe(
        "Direct Postgres URL bypassing the pooler, for advisory locks and DDL. Falls back to DATABASE_URL.",
      ),
    TEST_DATABASE_URL: z.string().url().optional(),
    DB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(MAX_POOL_SIZE).default(10),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DB_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(90),
    INVITATION_RETENTION_DAYS: z.coerce.number().int().min(7).max(3650).default(90),
    REDIS_URL: z.string().url().optional(),
    FEATURE_FLAGS: z
      .string()
      .default("{}")
      .refine(isFeatureFlagsJson, "FEATURE_FLAGS must be a JSON object of booleans"),

    JWT_SECRET: z.string().min(32).default(DEFAULT_JWT_SECRET),
    JWT_REFRESH_SECRET: z.string().min(32).default(DEFAULT_REFRESH_SECRET),
    JWT_SIGNING_KEYS: z.preprocess(parseJsonKeyring, jwtKeyringSchema.optional()),
    JWT_REFRESH_SIGNING_KEYS: z.preprocess(parseJsonKeyring, jwtKeyringSchema.optional()),
    JWT_ACTIVE_KEY_ID: z
      .string()
      .regex(JWT_KEY_ID_PATTERN, "JWT_ACTIVE_KEY_ID is invalid")
      .default("primary"),
    JWT_REFRESH_ACTIVE_KEY_ID: z
      .string()
      .regex(JWT_KEY_ID_PATTERN, "JWT_REFRESH_ACTIVE_KEY_ID is invalid")
      .default("primary"),
    METRICS_TOKEN: z.string().min(32).optional(),
    JWT_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
    JWT_ISSUER: z.string().min(1).default("modular-monolith-api"),
    JWT_AUDIENCE: z.string().min(1).default("modular-monolith-client"),

    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(9464),

    IDEMPOTENCY_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(7 * 24 * 60 * 60)
      .default(24 * 60 * 60),
    IDEMPOTENCY_PROCESSING_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(60 * 60)
      .default(5 * 60),
    IDEMPOTENCY_STALE_AFTER_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(60 * 60)
      .default(60),
    IDEMPOTENCY_MAX_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .default(1024 * 1024),

    LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOCKOUT_DURATION_MINUTES: z.coerce.number().int().positive().default(15),

    OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(emptyStringAsUndefined, z.string().url().optional()),
    OTEL_TRACE_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(0.2),
    LOKI_HOST: z.preprocess(emptyStringAsUndefined, z.string().url().optional()),
    ERROR_REPORTING_URL: z.preprocess(emptyStringAsUndefined, z.string().url().optional()),
    ERROR_REPORTING_TOKEN: z.preprocess(emptyStringAsUndefined, z.string().min(16).optional()),

    STORAGE_DRIVER: z.enum(["s3"]).default("s3"),
    STORAGE_PROVIDER: z
      .enum([
        "minio",
        "r2",
        "wasabi",
        "s3",
        "b2",
        "digitalocean-spaces",
        "linode",
        "vultr",
        "scaleway",
        "gcs",
        "oracle-oci",
        "ibm-cos",
        "alibaba-oss",
        "tencent-cos",
        "idrive-e2",
        "storj",
        "supabase",
        "cloudian",
        "other",
      ])
      .optional(),
    CDN_BASE_URL: z.preprocess(emptyStringAsUndefined, z.string().url().optional()),
    S3_ENDPOINT: z.preprocess(emptyStringAsUndefined, z.string().url().optional()),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().default("uploads"),
    S3_ACCESS_KEY_ID: z.preprocess(emptyStringAsUndefined, z.string().optional()),
    S3_SECRET_ACCESS_KEY: z.preprocess(emptyStringAsUndefined, z.string().optional()),
    S3_FORCE_PATH_STYLE: environmentBoolean(false),
    FILE_USER_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(100 * 1024 * 1024),
    FILE_TENANT_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024 * 1024),
    FILE_TENANT_MAX_OBJECTS: z.coerce.number().int().positive().default(100_000),
    FILE_AV_ENABLED: environmentBoolean(false),
    FILE_AV_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),

    EMAIL_DRIVER: z.enum(["resend", "smtp"]).default("smtp"),
    RESEND_API_KEY: z.string().default(""),
    EMAIL_FROM: z.string().email().default("noreply@example.com"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(1025),
    SMTP_USER: z.string().default(""),
    SMTP_PASS: z.string().default(""),

    PUSH_PROVIDER: z.enum(["none", "expo"]).default("none"),
    EXPO_ACCESS_TOKEN: z.preprocess(emptyStringAsUndefined, z.string().min(16).optional()),
    NOTIFICATION_DIGEST_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(20),

    SEED_ADMIN_EMAIL: z.string().email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
  })
  .superRefine(validateEnvironment);

export type Env = z.infer<typeof envSchema>;
