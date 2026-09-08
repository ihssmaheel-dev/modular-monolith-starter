import "dotenv/config";
import { readFileSync } from "node:fs";
import { envSchema, type Env } from "@repo/contracts";

const SECRET_FILE_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_SIGNING_KEYS",
  "JWT_REFRESH_SIGNING_KEYS",
  "METRICS_TOKEN",
  "ERROR_REPORTING_TOKEN",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "SMTP_USER",
  "SMTP_PASS",
  "RESEND_API_KEY",
  "EXPO_ACCESS_TOKEN",
  "SEED_ADMIN_PASSWORD",
] as const;

function resolveFileSecrets(source: Record<string, string | undefined>): void {
  for (const name of SECRET_FILE_VARS) {
    const fileVar = `${name}_FILE`;
    const filePath = source[fileVar];
    if (!filePath) continue;
    try {
      const value = readFileSync(filePath, "utf8").trim();
      if (value) source[name] = value;
    } catch (error) {
      throw new Error(
        `Failed to read secret file for ${name} from ${filePath}: ${(error as Error).message}`,
      );
    }
  }
}

function loadEnv(): Env {
  resolveFileSecrets(process.env as Record<string, string | undefined>);
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = JSON.stringify(result.error.flatten().fieldErrors);
    throw new Error(`Invalid environment variables: ${details}`);
  }

  return result.data;
}

export const env = loadEnv();
