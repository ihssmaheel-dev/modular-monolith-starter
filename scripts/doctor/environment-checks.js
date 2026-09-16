const fs = require("node:fs");
const path = require("node:path");
const { readEnv, runProcess, ROOT } = require("./runtime");
const { result } = require("./result");
const {
  checkInfrastructureUrls,
  checkPublicUrls,
  checkTestDatabase,
} = require("./environment-url-checks");

const JWT_MINIMUM_LENGTH = 32;
const API_REQUIRED_KEYS = [
  "NODE_ENV",
  "PORT",
  "TENANCY_MODE",
  "CLIENT_URL",
  "API_URL",
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
];

function checkEnvironment(results) {
  const api = readEnv("apps/api/.env");
  const web = readEnv("apps/web/.env");
  const mobile = readEnv("apps/mobile/.env");
  checkEnvironmentFile(results, "api-env", "API environment", api, true, "apps/api/.env.example");
  checkEnvironmentFile(results, "web-env", "Web environment", web, false, "apps/web/.env.example");
  checkEnvironmentFile(
    results,
    "mobile-env",
    "Mobile environment",
    mobile,
    false,
    "apps/mobile/.env.example",
  );
  checkClientRequiredValues(results, web, mobile);
  checkEnvironmentExamples(results);
  if (!api) return null;

  const missing = API_REQUIRED_KEYS.filter((key) => !api[key]);
  results.push(
    result(
      "Environment",
      "api-required-values",
      "API required values",
      missing.length === 0 ? "pass" : "fail",
      missing.length === 0
        ? "required local values are configured"
        : `missing keys: ${missing.join(", ")}`,
      missing.length === 0 ? undefined : "Copy the missing keys from apps/api/.env.example.",
    ),
  );
  checkModes(results, api);
  checkSecrets(results, api);
  checkPublicUrls(results, api, web, mobile);
  checkInfrastructureUrls(results, api);
  checkTestDatabase(results, api);
  checkIntelligenceTooling(results, api);
  return api;
}

function checkIntelligenceTooling(results, api) {
  const enabled = api.INTELLIGENCE_ENABLED === "true" || api.INTELLIGENCE_ENABLED === "1";
  if (!enabled) {
    results.push(
      result(
        "Optional services",
        "intelligence-tooling",
        "Python intelligence tooling",
        "skip",
        "intelligence is disabled; Python and uv are not required",
      ),
    );
    return;
  }
  const python = runProcess("python", ["--version"], 5_000);
  const uv = runProcess("uv", ["--version"], 5_000);
  const pythonVersion = `${python.stdout || ""}${python.stderr || ""}`.trim();
  const python312 = /Python\s+3\.12(?:\.|\s|$)/.test(pythonVersion);
  const lockfile = fs.existsSync(path.join(ROOT, "apps/intelligence/uv.lock"));
  const configurationKeys = [
    "INTELLIGENCE_SERVICE_URL",
    "INTELLIGENCE_SERVICE_TOKEN",
    "INTELLIGENCE_DATA_ENCRYPTION_KEY",
    "INTELLIGENCE_MODEL",
    "INTELLIGENCE_EMBEDDING_MODEL",
  ];
  const missingConfiguration = configurationKeys.filter((key) => !api[key]);
  const valid = python.status === 0 && python312 && uv.status === 0 && lockfile;
  const configurationValid = missingConfiguration.length === 0;
  results.push(
    result(
      "Optional services",
      "intelligence-tooling",
      "Python intelligence tooling",
      valid && configurationValid ? "pass" : "fail",
      valid && configurationValid
        ? `${pythonVersion} and ${uv.stdout.trim()} are available; uv.lock and provider configuration are present`
        : !valid
          ? "intelligence is enabled but Python 3.12+, uv, or uv.lock is missing"
          : `intelligence configuration is missing: ${missingConfiguration.join(", ")}`,
      valid && configurationValid
        ? undefined
        : !valid
          ? "Install Python 3.12 and uv, then run `pnpm intelligence:install`."
          : "Set the missing INTELLIGENCE_* values in apps/api/.env and provision the Python service.",
    ),
  );
}

function checkEnvironmentFile(results, id, name, values, required, template) {
  const status = values ? "pass" : required ? "fail" : "warn";
  results.push(
    result(
      "Environment",
      id,
      name,
      status,
      values ? "local file present" : "local file is missing",
      values ? undefined : `Copy ${template} to ${template.replace(".example", "")}.`,
    ),
  );
}

function checkClientRequiredValues(results, web, mobile) {
  const missing = [];
  if (web && !web.VITE_API_URL) missing.push("VITE_API_URL");
  if (mobile && !mobile.EXPO_PUBLIC_API_URL) missing.push("EXPO_PUBLIC_API_URL");
  results.push(
    result(
      "Environment",
      "client-required-values",
      "Client required values",
      missing.length === 0 ? "pass" : "fail",
      missing.length === 0
        ? "present client environment files contain API URLs"
        : `missing keys: ${missing.join(", ")}`,
      missing.length === 0
        ? undefined
        : "Restore the missing values from the client .env.example files.",
    ),
  );
}

function checkEnvironmentExamples(results) {
  const apiExample = readEnv("apps/api/.env.example");
  const webExample = readEnv("apps/web/.env.example");
  const mobileExample = readEnv("apps/mobile/.env.example");
  let aligned = false;
  try {
    const apiOrigin = new URL(apiExample.API_URL).origin;
    aligned =
      new URL(webExample.VITE_API_URL).origin === apiOrigin &&
      new URL(mobileExample.EXPO_PUBLIC_API_URL).origin === apiOrigin;
  } catch {
    aligned = false;
  }
  results.push(
    result(
      "Environment",
      "example-url-alignment",
      "Example URL alignment",
      aligned ? "pass" : "fail",
      aligned
        ? "API, web, and mobile examples use one local API origin"
        : "example API origins disagree",
      aligned
        ? undefined
        : "Align the three committed .env.example files with the documented ports.",
    ),
  );
}

function checkSecrets(results, api) {
  const access = api.JWT_SECRET || "";
  const refresh = api.JWT_REFRESH_SECRET || "";
  const placeholder = /change-in-prod|your-super-secret|replace-with/i;
  const valid =
    access.length >= JWT_MINIMUM_LENGTH &&
    refresh.length >= JWT_MINIMUM_LENGTH &&
    access !== refresh &&
    !placeholder.test(access) &&
    !placeholder.test(refresh);
  results.push(
    result(
      "Environment",
      "jwt-secrets",
      "JWT secrets",
      valid ? "pass" : "fail",
      valid
        ? "separate non-placeholder secrets are configured"
        : "secrets are missing, weak, equal, or placeholders",
      valid
        ? undefined
        : "Run `pnpm bootstrap` on a fresh setup or replace both secrets with distinct random values.",
    ),
  );
}

function checkModes(results, api) {
  const issues = [];
  if (!["development", "test", "production"].includes(api.NODE_ENV)) {
    issues.push("NODE_ENV is invalid");
  }
  if (!["single", "multi"].includes(api.TENANCY_MODE)) issues.push("TENANCY_MODE is invalid");
  results.push(
    result(
      "Environment",
      "runtime-modes",
      "Runtime modes",
      issues.length === 0 ? "pass" : "fail",
      issues.length === 0 ? "environment and tenancy modes are valid" : issues.join("; "),
      issues.length === 0 ? undefined : "Use documented values from apps/api/.env.example.",
    ),
  );
}

module.exports = { checkEnvironment };
