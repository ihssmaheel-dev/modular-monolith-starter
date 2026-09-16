const { commandDetail, probePort, runProcess } = require("./runtime");
const { result } = require("./result");

const REQUIRED_LOCAL_SERVICES = ["postgres", "redis", "minio", "mailpit"];

async function checkServices(results, api, options) {
  if (options.skipServices) {
    results.push(
      result(
        "Local services",
        "service-connectivity",
        "Dependency connectivity",
        "skip",
        "disabled by --skip-services",
      ),
    );
    return;
  }
  const daemonReady = results.some((item) => item.id === "docker-daemon" && item.status === "pass");
  if (daemonReady) checkComposeServices(results);
  else {
    results.push(
      result(
        "Local services",
        "compose-services",
        "Compose services",
        "skip",
        "Docker daemon is unavailable",
      ),
    );
  }
  if (!api) {
    results.push(
      result(
        "Local services",
        "service-connectivity",
        "Dependency connectivity",
        "skip",
        "API environment is unavailable",
      ),
    );
    return;
  }
  const probes = await Promise.all(
    serviceEndpoints(api).map(async (endpoint) => ({
      ...endpoint,
      reachable: await probePort(endpoint.host, endpoint.port),
    })),
  );
  for (const probe of probes) {
    results.push(
      result(
        "Local services",
        `connect-${probe.id}`,
        probe.name,
        probe.reachable ? "pass" : "warn",
        probe.reachable
          ? `reachable on ${probe.host}:${probe.port}`
          : `not reachable on ${probe.host}:${probe.port}`,
        probe.reachable ? undefined : probe.fix,
      ),
    );
  }
}

function checkComposeServices(results) {
  const running = runProcess(
    "docker",
    ["compose", "-f", "docker/docker-compose.yml", "ps", "--services", "--status", "running"],
    10_000,
  );
  if (running.status !== 0) {
    results.push(
      result(
        "Local services",
        "compose-services",
        "Compose services",
        "warn",
        commandDetail(running),
        "Run `pnpm docker:up` and inspect `pnpm docker:logs`.",
      ),
    );
    return;
  }
  const names = new Set(
    running.stdout
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const missing = REQUIRED_LOCAL_SERVICES.filter((name) => !names.has(name));
  results.push(
    result(
      "Local services",
      "compose-services",
      "Compose services",
      missing.length === 0 ? "pass" : "warn",
      missing.length === 0
        ? "required local containers are running"
        : `not running: ${missing.join(", ")}`,
      missing.length === 0 ? undefined : "Run `pnpm docker:up`.",
    ),
  );
}

function serviceEndpoints(api) {
  const endpoints = [];
  addUrlEndpoint(
    endpoints,
    "postgres",
    "PostgreSQL",
    api.DATABASE_URL,
    5432,
    "Run `pnpm docker:up`.",
  );
  if (api.REDIS_URL) {
    addUrlEndpoint(endpoints, "redis", "Redis", api.REDIS_URL, 6379, "Run `pnpm docker:up`.");
  }
  if (api.STORAGE_DRIVER === "s3" && api.S3_ENDPOINT) {
    addUrlEndpoint(
      endpoints,
      "storage",
      "Object storage",
      api.S3_ENDPOINT,
      9000,
      "Run `pnpm docker:up` and `pnpm docker:init`.",
    );
  }
  if (api.EMAIL_DRIVER === "smtp" && api.SMTP_HOST) {
    const smtpPort = Number(api.SMTP_PORT || 1025);
    if (Number.isInteger(smtpPort)) {
      endpoints.push({
        id: "smtp",
        name: "SMTP",
        host: api.SMTP_HOST,
        port: smtpPort,
        fix: "Run `pnpm docker:up` to start Mailpit.",
      });
    }
  }
  if (api.INTELLIGENCE_ENABLED === "true" || api.INTELLIGENCE_ENABLED === "1") {
    addUrlEndpoint(
      endpoints,
      "intelligence",
      "Python intelligence",
      api.INTELLIGENCE_SERVICE_URL,
      8080,
      "Run `pnpm intelligence:up` and verify the private intelligence service is healthy.",
    );
  }
  return endpoints;
}

function addUrlEndpoint(endpoints, id, name, value, defaultPort, fix) {
  if (!value) return;
  try {
    const url = new URL(value);
    endpoints.push({ id, name, host: url.hostname, port: Number(url.port || defaultPort), fix });
  } catch {
    // Environment validation reports malformed values; connectivity is skipped.
  }
}

module.exports = { checkServices };
