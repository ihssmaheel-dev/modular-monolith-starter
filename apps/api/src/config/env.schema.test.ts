import { describe, expect, it } from "vitest";
import { envSchema } from "@repo/contracts";

describe("production environment validation", () => {
  it("rejects local service defaults in production", () => {
    const result = envSchema.safeParse({ NODE_ENV: "production" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["DATABASE_URL", "CLIENT_URL", "API_URL"]),
      );
    }
  });

  it("requires provider-specific email configuration", () => {
    const result = envSchema.safeParse({ ...validProductionEnv(), EMAIL_DRIVER: "resend" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "RESEND_API_KEY")).toBe(true);
    }
  });

  it("accepts a complete production configuration", () => {
    const result = envSchema.safeParse(validProductionEnv());

    expect(result.success).toBe(true);
  });

  it("parses explicit boolean strings without treating false as truthy", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "test",
      TRUST_PROXY: "false",
      FILE_AV_ENABLED: "false",
      FILE_AV_URL: "",
      S3_FORCE_PATH_STYLE: "0",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TRUST_PROXY).toBe(false);
      expect(result.data.FILE_AV_ENABLED).toBe(false);
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(false);
    }
  });

  it("rejects ambiguous environment boolean values", () => {
    const result = envSchema.safeParse({ NODE_ENV: "test", TRUST_PROXY: "yes" });

    expect(result.success).toBe(false);
  });

  it("accepts overlapping access and refresh signing keyrings", () => {
    const result = envSchema.safeParse({
      ...validProductionEnv(),
      JWT_SIGNING_KEYS: JSON.stringify({ old: "o".repeat(32), current: "c".repeat(32) }),
      JWT_REFRESH_SIGNING_KEYS: JSON.stringify({ old: "p".repeat(32), current: "q".repeat(32) }),
      JWT_ACTIVE_KEY_ID: "current",
      JWT_REFRESH_ACTIVE_KEY_ID: "current",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_SIGNING_KEYS).toEqual({
        old: "o".repeat(32),
        current: "c".repeat(32),
      });
      expect(result.data.JWT_ACTIVE_KEY_ID).toBe("current");
    }
  });

  it("rejects a signing keyring with an unknown active key", () => {
    const result = envSchema.safeParse({
      ...validProductionEnv(),
      JWT_SIGNING_KEYS: JSON.stringify({ current: "c".repeat(32) }),
      JWT_ACTIVE_KEY_ID: "missing",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        "JWT_ACTIVE_KEY_ID",
      );
    }
  });

  it("rejects insecure public endpoints in production", () => {
    const result = envSchema.safeParse({
      ...validProductionEnv(),
      CLIENT_URL: "http://app.example.test",
      API_URL: "http://api.example.test",
      S3_ENDPOINT: "http://storage.example.test",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["CLIENT_URL", "API_URL", "S3_ENDPOINT"]),
      );
    }
  });

  it("requires encrypted database and Redis connections in production", () => {
    const result = envSchema.safeParse({
      ...validProductionEnv(),
      DATABASE_URL: "postgres://db.internal:5432/app",
      REDIS_URL: "redis://redis.internal:6379",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["DATABASE_URL", "REDIS_URL"]),
      );
    }
  });

  it("rejects untouched production placeholders and example domains", () => {
    const result = envSchema.safeParse({
      ...validProductionEnv(),
      JWT_SECRET: "replace-with-at-least-32-random-characters",
      CLIENT_URL: "https://app.example.com",
      EMAIL_FROM: "noreply@example.com",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["JWT_SECRET", "CLIENT_URL", "EMAIL_FROM"]),
      );
    }
  });

  it("rejects the local development SMTP port in production", () => {
    const result = envSchema.safeParse({ ...validProductionEnv(), SMTP_PORT: "1025" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("SMTP_PORT");
    }
  });

  it("allows the cloud SDK workload identity credential chain", () => {
    const production = validProductionEnv();
    delete production.S3_ENDPOINT;
    delete production.S3_ACCESS_KEY_ID;
    delete production.S3_SECRET_ACCESS_KEY;

    const result = envSchema.safeParse(production);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_ENDPOINT).toBeUndefined();
      expect(result.data.S3_ACCESS_KEY_ID).toBeUndefined();
      expect(result.data.S3_SECRET_ACCESS_KEY).toBeUndefined();
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(false);
    }
  });

  it("defaults INTELLIGENCE_ENABLED to false with zero runtime overhead", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.INTELLIGENCE_ENABLED).toBe(false);
      expect(result.data.INTELLIGENCE_URL).toBe("http://127.0.0.1:5157");
      expect(result.data.INTELLIGENCE_TIMEOUT_MS).toBe(5000);
    }
  });

  it("rejects placeholder INTELLIGENCE_SHARED_SECRET when INTELLIGENCE_ENABLED is true in production", () => {
    const result = envSchema.safeParse({
      ...validProductionEnv(),
      INTELLIGENCE_ENABLED: "true",
      INTELLIGENCE_SHARED_SECRET:
        "your-super-secret-intelligence-shared-key-min-32-chars-change-in-prod",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("INTELLIGENCE_SHARED_SECRET")),
      ).toBe(true);
    }
  });

  it("accepts valid INTELLIGENCE configuration in production", () => {
    const result = envSchema.safeParse({
      ...validProductionEnv(),
      INTELLIGENCE_ENABLED: "true",
      INTELLIGENCE_URL: "https://intelligence.internal",
      INTELLIGENCE_SHARED_SECRET: "s".repeat(32),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.INTELLIGENCE_ENABLED).toBe(true);
      expect(result.data.INTELLIGENCE_SHARED_SECRET).toBe("s".repeat(32));
    }
  });
});

function validProductionEnv(): Record<string, string> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://db.internal:5432/app?sslmode=require",
    CLIENT_URL: "https://app.example.test",
    API_URL: "https://api.example.test",
    REDIS_URL: "rediss://redis.internal:6379",
    METRICS_TOKEN: "m".repeat(32),
    JWT_SECRET: "j".repeat(32),
    JWT_REFRESH_SECRET: "r".repeat(32),
    S3_ENDPOINT: "https://storage.example.test",
    S3_REGION: "us-east-1",
    S3_BUCKET: "production-uploads",
    S3_ACCESS_KEY_ID: "production-access",
    S3_SECRET_ACCESS_KEY: "production-secret",
    EMAIL_DRIVER: "smtp",
    EMAIL_FROM: "noreply@company.test",
    SMTP_HOST: "smtp.company.test",
    SMTP_PORT: "587",
  };
}
