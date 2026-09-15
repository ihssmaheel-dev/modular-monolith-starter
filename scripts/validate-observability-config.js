const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const configPath = process.argv[2];
const root = path.resolve(__dirname, "..");
const composeFiles = [
  "docker/docker-compose.prod.yml",
  "docker/docker-compose.observability.yml",
  "docker/docker-compose.prod.observability.yml",
];
const config = configPath
  ? JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"))
  : renderProductionConfig();
const failures = [];
const services = config.services ?? {};
const observabilityServices = [
  "prometheus",
  "alertmanager",
  "loki",
  "alloy",
  "tempo",
  "grafana",
  "postgres-exporter",
  "redis-exporter",
];

for (const serviceName of observabilityServices) {
  const service = services[serviceName];
  if (!service) {
    failures.push(`${serviceName}: service is missing from the production observability profile`);
    continue;
  }
  if (Array.isArray(service.ports) && service.ports.length > 0) {
    failures.push(`${serviceName}: production observability services must not publish host ports`);
  }
  for (const field of ["restart", "mem_limit", "cpus", "pids_limit"]) {
    if (service[field] === undefined || service[field] === null || service[field] === "") {
      failures.push(`${serviceName}: missing bounded ${field}`);
    }
  }
  if (service.logging?.driver !== "json-file") {
    failures.push(`${serviceName}: production logs must use the bounded json-file driver`);
  }
  if (!service.logging?.options?.["max-size"] || !service.logging?.options?.["max-file"]) {
    failures.push(`${serviceName}: production container log rotation is not bounded`);
  }
}

if (services.cadvisor) {
  failures.push(
    "cadvisor: privileged host collector must remain outside the default production profile",
  );
}

for (const serviceName of ["api", "worker"]) {
  if (!services[serviceName]?.environment?.OTEL_EXPORTER_OTLP_ENDPOINT) {
    failures.push(`${serviceName}: production OTLP endpoint is missing`);
  }
}

const grafanaEnvironment = services.grafana?.environment ?? {};
if (
  !grafanaEnvironment.GF_SECURITY_ADMIN_PASSWORD ||
  grafanaEnvironment.GF_SECURITY_ADMIN_PASSWORD === "admin"
) {
  failures.push("grafana: production admin password is missing or uses the default value");
}

const prometheusCommand = (services.prometheus?.command ?? []).join(" ");
for (const flag of ["--storage.tsdb.retention.time=15d", "--storage.tsdb.retention.size=10GB"]) {
  if (!prometheusCommand.includes(flag)) {
    failures.push(`prometheus: missing bounded retention flag ${flag}`);
  }
}

for (const serviceName of ["api", "worker", "web", "nginx"]) {
  if (services[serviceName]?.labels?.["observability.logs"] !== "true") {
    failures.push(`${serviceName}: production logs must opt in with observability.logs=true`);
  }
}

const dashboardDirectory = path.join(root, "docker/observability/grafana/dashboards");
for (const dashboard of fs.readdirSync(dashboardDirectory)) {
  if (!dashboard.endsWith(".json")) continue;
  const dashboardPath = path.join(dashboardDirectory, dashboard);
  try {
    JSON.parse(fs.readFileSync(dashboardPath, "utf8"));
  } catch (error) {
    failures.push(`${dashboard}: invalid JSON (${error.message})`);
  }
}

if (failures.length > 0) {
  console.error("Observability configuration validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Observability configuration is production-safe and dashboards are valid JSON.");

function renderProductionConfig() {
  const requiredVariables = new Set();
  for (const file of composeFiles) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of source.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?[^}]*\}/g)) {
      requiredVariables.add(match[1]);
    }
  }
  const validationEnvironment = { ...process.env };
  for (const name of requiredVariables) validationEnvironment[name] = "validation-value";
  validationEnvironment.API_IMAGE_REF = "example.invalid/app-api:validation";
  validationEnvironment.WEB_IMAGE_REF = "example.invalid/app-web:validation";
  validationEnvironment.GF_SECURITY_ADMIN_PASSWORD = "validation-grafana-password";
  validationEnvironment.METRICS_TOKEN_FILE = "./observability/prometheus/prometheus.yml";
  validationEnvironment.ALERTMANAGER_CONFIG_FILE =
    "./observability/alertmanager/alertmanager.prod.example.yml";
  validationEnvironment.ALERTMANAGER_SMTP_PASSWORD_FILE =
    "./observability/alertmanager/alertmanager.prod.example.yml";

  const args = ["compose"];
  for (const file of composeFiles) args.push("-f", file);
  args.push("--profile", "observability", "config", "--format", "json");
  const result = spawnSync("docker", args, {
    cwd: root,
    env: validationEnvironment,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || "unknown Docker Compose error";
    throw new Error(`Unable to render production observability configuration: ${detail}`);
  }
  return JSON.parse(result.stdout);
}
