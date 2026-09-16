const { result } = require("./result");

function checkPublicUrls(results, api, web, mobile) {
  const issues = [];
  let apiUrl;
  try {
    apiUrl = new URL(api.API_URL);
    const port = Number(api.PORT);
    const urlPort = Number(apiUrl.port || (apiUrl.protocol === "https:" ? 443 : 80));
    if (!Number.isInteger(port) || port < 1 || port > 65_535) issues.push("PORT is invalid");
    else if (urlPort !== port) issues.push("API_URL and PORT disagree");
  } catch {
    issues.push("API_URL is invalid");
  }
  const clientOrigins = String(api.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of clientOrigins) {
    try {
      new URL(origin);
    } catch {
      issues.push("CLIENT_URL contains an invalid origin");
    }
  }
  if (api.NODE_ENV === "development" && !clientOrigins.includes("http://localhost:5155")) {
    issues.push("CLIENT_URL omits the web development origin http://localhost:5155");
  }
  checkClientApiUrl(issues, "VITE_API_URL", web?.VITE_API_URL, apiUrl, true);
  checkClientApiUrl(issues, "EXPO_PUBLIC_API_URL", mobile?.EXPO_PUBLIC_API_URL, apiUrl, false);
  results.push(
    result(
      "Environment",
      "public-urls",
      "Application URLs",
      issues.length === 0 ? "pass" : "fail",
      issues.length === 0 ? "configured origins and versioned API paths align" : issues.join("; "),
      issues.length === 0
        ? undefined
        : "Align local URLs with apps/*/.env.example and the 5155/5156 development ports.",
    ),
  );
}

function checkInfrastructureUrls(results, api) {
  const issues = [];
  validateProtocol(issues, "DATABASE_URL", api.DATABASE_URL, ["postgres:", "postgresql:"]);
  if (api.REDIS_URL) validateProtocol(issues, "REDIS_URL", api.REDIS_URL, ["redis:", "rediss:"]);
  if (api.S3_ENDPOINT) {
    validateProtocol(issues, "S3_ENDPOINT", api.S3_ENDPOINT, ["http:", "https:"]);
  }
  results.push(
    result(
      "Environment",
      "infrastructure-urls",
      "Infrastructure URLs",
      issues.length === 0 ? "pass" : "fail",
      issues.length === 0 ? "database, cache, and storage URLs are valid" : issues.join("; "),
      issues.length === 0 ? undefined : "Correct malformed or unsupported URLs in apps/api/.env.",
    ),
  );
}

function checkTestDatabase(results, api) {
  if (!api.TEST_DATABASE_URL) {
    results.push(
      result(
        "Environment",
        "test-database",
        "Test database safety",
        "warn",
        "TEST_DATABASE_URL is not configured; integration tests are unavailable",
        "Add the test-only URL from apps/api/.env.example before running integration tests.",
      ),
    );
    return;
  }
  let safe = false;
  try {
    const databaseName = new URL(api.TEST_DATABASE_URL).pathname.replace(/^\//, "");
    safe = databaseName.toLowerCase().includes("test");
  } catch {
    safe = false;
  }
  results.push(
    result(
      "Environment",
      "test-database",
      "Test database safety",
      safe ? "pass" : "fail",
      safe
        ? "test database name contains the required test marker"
        : "TEST_DATABASE_URL is invalid or unsafe",
      safe ? undefined : "Use a dedicated database whose name contains `test`.",
    ),
  );
}

function validateProtocol(issues, name, value, protocols) {
  try {
    if (!protocols.includes(new URL(value).protocol))
      issues.push(`${name} uses an invalid protocol`);
  } catch {
    issues.push(`${name} is invalid`);
  }
}

function checkClientApiUrl(issues, name, value, apiUrl, enforceOrigin) {
  if (!value) return;
  try {
    const clientApi = new URL(value);
    if (enforceOrigin && apiUrl && clientApi.origin !== apiUrl.origin) {
      issues.push(`${name} and API_URL origins disagree`);
    }
    if (!clientApi.pathname.endsWith("/api/v1")) issues.push(`${name} is not versioned at /api/v1`);
  } catch {
    issues.push(`${name} is invalid`);
  }
}

module.exports = { checkInfrastructureUrls, checkPublicUrls, checkTestDatabase };
