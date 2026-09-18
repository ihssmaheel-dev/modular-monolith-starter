import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { envSchema } from "@repo/contracts";

function extractEnvKeysFromCompose(filePath: string, serviceName: string): string[] {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  let inService = false;
  let inEnvironment = false;
  let currentIndent = 0;
  const envKeys: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();

    if (/^ {2}[a-zA-Z0-9_-]+:/.test(line)) {
      inService = line.startsWith(`  ${serviceName}:`);
      inEnvironment = false;
      continue;
    }

    if (inService && /^ {4}environment:/.test(line)) {
      inEnvironment = true;
      currentIndent = line.search(/\S/);
      continue;
    }

    if (inService && inEnvironment) {
      const lineIndent = line.search(/\S/);
      if (lineIndent <= currentIndent && trimmed.length > 0 && !trimmed.startsWith("#")) {
        inEnvironment = false;
        continue;
      }
      const match = /^\s*([A-Z0-9_]+):/.exec(line);
      if (match?.[1]) {
        envKeys.push(match[1]);
      }
    }
  }

  return envKeys;
}

describe("API and Worker Production Configuration Parity", () => {
  const CRITICAL_SHARED_VARS = [
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "EMAIL_DRIVER",
    "EMAIL_FROM",
    "RESEND_API_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "STORAGE_DRIVER",
    "S3_BUCKET",
    "S3_REGION",
    "AUDIT_RETENTION_DAYS",
  ];

  it("ensures production compose worker contains all critical configuration present in api", () => {
    const composePath = resolve(process.cwd(), "../../docker/docker-compose.prod.yml");
    const apiKeys = extractEnvKeysFromCompose(composePath, "api");
    const workerKeys = extractEnvKeysFromCompose(composePath, "worker");

    expect(apiKeys.length).toBeGreaterThan(0);
    expect(workerKeys.length).toBeGreaterThan(0);

    for (const variable of CRITICAL_SHARED_VARS) {
      expect(
        workerKeys,
        `Expected worker in docker-compose.prod.yml to define ${variable}`,
      ).toContain(variable);
    }
  });

  it("ensures staging compose worker contains all critical configuration present in api", () => {
    const composePath = resolve(process.cwd(), "../../docker/docker-compose.staging.yml");
    const apiKeys = extractEnvKeysFromCompose(composePath, "api");
    const workerKeys = extractEnvKeysFromCompose(composePath, "worker");

    expect(apiKeys.length).toBeGreaterThan(0);
    expect(workerKeys.length).toBeGreaterThan(0);

    for (const variable of CRITICAL_SHARED_VARS) {
      expect(
        workerKeys,
        `Expected worker in docker-compose.staging.yml to define ${variable}`,
      ).toContain(variable);
    }
  });

  it("validates worker startup schema when EMAIL_DRIVER is resend and RESEND_API_KEY is provided", () => {
    const validWorkerEnv = {
      NODE_ENV: "production",
      PROCESS_ROLE: "worker",
      DATABASE_URL: "postgresql://postgres:postgres@db.company.com:5432/app?sslmode=require",
      REDIS_URL: "rediss://:password@redis.company.com:6379",
      JWT_SECRET: "strong-prod-jwt-secret-at-least-32-chars-long",
      JWT_REFRESH_SECRET: "strong-prod-jwt-refresh-secret-at-least-32-chars",
      METRICS_TOKEN: "valid-metrics-token-at-least-32-characters-long",
      CLIENT_URL: "https://app.company.com",
      API_URL: "https://api.company.com",
      EMAIL_DRIVER: "resend",
      RESEND_API_KEY: "re_valid_prod_key_12345",
      EMAIL_FROM: "notifications@company.com",
      S3_BUCKET: "company-uploads",
      S3_REGION: "us-east-1",
    };

    const parsed = envSchema.safeParse(validWorkerEnv);
    expect(parsed.success).toBe(true);
  });

  it("rejects worker startup schema when EMAIL_DRIVER is resend but RESEND_API_KEY is missing", () => {
    const invalidWorkerEnv = {
      NODE_ENV: "production",
      PROCESS_ROLE: "worker",
      DATABASE_URL: "postgresql://postgres:postgres@db.company.com:5432/app?sslmode=require",
      REDIS_URL: "rediss://:password@redis.company.com:6379",
      JWT_SECRET: "strong-prod-jwt-secret-at-least-32-chars-long",
      JWT_REFRESH_SECRET: "strong-prod-jwt-refresh-secret-at-least-32-chars",
      METRICS_TOKEN: "valid-metrics-token-at-least-32-characters-long",
      CLIENT_URL: "https://app.company.com",
      API_URL: "https://api.company.com",
      EMAIL_DRIVER: "resend",
      RESEND_API_KEY: "",
      EMAIL_FROM: "notifications@company.com",
      S3_BUCKET: "company-uploads",
      S3_REGION: "us-east-1",
    };

    const parsed = envSchema.safeParse(invalidWorkerEnv);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issuePaths = parsed.error.issues.map((i) => i.path.join("."));
      expect(issuePaths).toContain("RESEND_API_KEY");
    }
  });
});
