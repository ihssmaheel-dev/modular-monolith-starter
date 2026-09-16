const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BRAND_FILES = [
  ".github/workflows/ci.yml",
  "README.md",
  "apps/api/.env.example",
  "apps/mobile/.env.example",
  "apps/mobile/app.json",
  "apps/web/Dockerfile",
  "apps/web/.env.example",
  "docker/.env.prod.example",
  "docker/.env.staging.example",
  "docker/docker-compose.observability.yml",
  "docker/docker-compose.prod.yml",
  "docker/docker-compose.staging.yml",
  "docker/docker-compose.yml",
  "docker/observability/alertmanager/alertmanager.yml",
  "docker/observability/alloy/config.alloy",
  "docker/observability/grafana/dashboards/api-overview.json",
  "docker/observability/grafana/dashboards/database-redis.json",
  "docker/observability/prometheus/alerts.yml",
  "docker/observability/prometheus/prometheus.prod.yml",
  "package.json",
  "packages/contracts/src/constants/index.ts",
  "packages/contracts/src/schemas/env.schema.ts",
  "packages/contracts/src/schemas/mobile-env.schema.ts",
  "packages/contracts/src/schemas/web-env.schema.ts",
  "packages/email/src/emails/PasswordResetEmail.tsx",
  "packages/email/src/emails/WelcomeEmail.tsx",
];

const COMPOSE_FILES = [
  "docker/docker-compose.yml",
  "docker/docker-compose.observability.yml",
  "docker/docker-compose.staging.yml",
  "docker/docker-compose.prod.yml",
];

function buildProjectPlan(root, options) {
  const sources = readSources(root);
  const current = detectIdentity(sources);
  const updates = new Map(sources);
  const update = (file, transform) => updates.set(file, transform(updates.get(file), current));

  update("package.json", (source) =>
    updateJson(source, (value) => ({ ...value, name: options.slug })),
  );
  update("README.md", (source) => source.replace(/^# .*$/m, `# ${options.name}`));
  update("apps/mobile/app.json", (source) =>
    updateJson(source, (value) => ({
      ...value,
      expo: {
        ...value.expo,
        name: options.name,
        slug: options.slug,
        scheme: options.scheme,
        ios: { ...value.expo.ios, bundleIdentifier: options.bundleId },
        android: { ...value.expo.android, package: options.bundleId },
      },
    })),
  );

  update("apps/api/.env.example", (source) => setApiIdentity(source, options));
  update("apps/web/.env.example", (source) => setEnvValue(source, "VITE_APP_NAME", options.name));
  update("apps/web/Dockerfile", (source, identity) =>
    replaceLiteral(
      source,
      `ARG VITE_APP_NAME=${identity.name}`,
      `ARG VITE_APP_NAME=${options.name}`,
      "web image application-name default",
    ),
  );
  update("apps/mobile/.env.example", (source) =>
    setEnvValue(source, "EXPO_PUBLIC_APP_NAME", options.name),
  );
  for (const file of ["docker/.env.prod.example", "docker/.env.staging.example"]) {
    update(file, (source) => setDeploymentIdentity(source, options));
  }

  update("packages/contracts/src/constants/index.ts", (source, identity) =>
    replaceLiteral(
      source,
      `export const APP_NAME = "${identity.packageName}";`,
      `export const APP_NAME = "${options.slug}";`,
      "APP_NAME constant",
    ),
  );
  update("packages/contracts/src/schemas/env.schema.ts", (source, identity) =>
    replaceSchemaDefaults(source, identity, options),
  );
  for (const file of [
    "packages/contracts/src/schemas/web-env.schema.ts",
    "packages/contracts/src/schemas/mobile-env.schema.ts",
  ]) {
    update(file, (source, identity) =>
      replaceLiteral(
        source,
        `.default(${JSON.stringify(identity.name)})`,
        `.default(${JSON.stringify(options.name)})`,
        `${file} application-name default`,
      ),
    );
  }
  update("packages/email/src/emails/WelcomeEmail.tsx", (source, identity) =>
    replaceLiteral(
      source,
      `preview: "Welcome to ${identity.name}"`,
      `preview: "Welcome to ${options.name}"`,
      "welcome-email preview brand",
    ),
  );
  update("packages/email/src/emails/PasswordResetEmail.tsx", (source, identity) =>
    replaceLiteral(
      source,
      `preview: "Reset your ${identity.name} password"`,
      `preview: "Reset your ${options.name} password"`,
      "password-reset preview brand",
    ),
  );

  for (const file of COMPOSE_FILES) {
    update(file, (source, identity) =>
      replaceComposeIdentity(
        replaceContainerPrefix(source, identity.containerPrefix, options.slug),
        options,
      ),
    );
  }
  update("docker/observability/prometheus/prometheus.prod.yml", (source) =>
    source.replace(/^(\s*service:)\s*[^\r\n]+$/m, `$1 ${options.slug}`),
  );
  update("docker/observability/prometheus/alerts.yml", (source, identity) =>
    source
      .replace(
        new RegExp(escapeRegExp(`${identity.slug}-reliability`), "g"),
        `${options.slug}-reliability`,
      )
      .replace(new RegExp(escapeRegExp(identity.containerPrefix), "g"), options.slug),
  );
  update("docker/observability/alloy/config.alloy", (source, identity) =>
    source.replace(new RegExp(escapeRegExp(identity.containerPrefix), "g"), options.slug),
  );
  update("docker/observability/grafana/dashboards/api-overview.json", (source, identity) =>
    source.replace(
      new RegExp(escapeRegExp(`${identity.containerPrefix}-.*`), "g"),
      `${options.slug}-.*`,
    ),
  );
  update("docker/observability/alertmanager/alertmanager.yml", (source, identity) =>
    source.replace(
      new RegExp(escapeRegExp(`${identity.slug}.local`), "g"),
      `${options.slug}.local`,
    ),
  );
  update(".github/workflows/ci.yml", (source, identity) =>
    source.replace(
      new RegExp(`${escapeRegExp(identity.slug)}-(api|web):ci`, "g"),
      `${options.slug}-$1:ci`,
    ),
  );
  if (options.repositoryUrl) {
    update("docker/observability/grafana/dashboards/database-redis.json", (source) =>
      source.replace(
        /https:\/\/[^"\\]+\/[^"\\]+\/blob\/main/g,
        `${options.repositoryUrl}/blob/main`,
      ),
    );
  }

  assertBrandOutput(updates, options);

  return BRAND_FILES.map((file) => ({
    file,
    before: sources.get(file),
    after: updates.get(file),
  })).filter(({ before, after }) => before !== after);
}

function createLocalEnvironmentPlan(root) {
  const apiSource = read(root, "apps/api/.env.example");
  const api = setEnvValue(
    setEnvValue(setEnvValue(apiSource, "JWT_SECRET", secret()), "JWT_REFRESH_SECRET", secret()),
    "METRICS_TOKEN",
    secret(32),
  );
  return [
    localFile(root, "apps/api/.env", api),
    localFile(root, "apps/web/.env", read(root, "apps/web/.env.example")),
    localFile(root, "apps/mobile/.env", read(root, "apps/mobile/.env.example")),
  ];
}

function applyPlan(root, plan) {
  const written = [];
  try {
    for (const change of plan) {
      const target = path.join(root, change.file);
      const existed = fs.existsSync(target);
      const before = existed ? fs.readFileSync(target, "utf8") : undefined;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, change.after, "utf8");
      written.push({ target, existed, before });
    }
  } catch (error) {
    for (const item of written.reverse()) {
      if (item.existed) fs.writeFileSync(item.target, item.before, "utf8");
      else fs.rmSync(item.target, { force: true });
    }
    throw error;
  }
}

function detectIdentity(sources) {
  const packageName = JSON.parse(sources.get("package.json")).name;
  const apiEnvironment = sources.get("apps/api/.env.example");
  const mobile = JSON.parse(sources.get("apps/mobile/app.json"));
  const containerMatch = sources
    .get("docker/docker-compose.yml")
    .match(/container_name:\s*([a-z0-9-]+)-postgres/);
  return {
    name:
      envValue(apiEnvironment, "APP_NAME") ??
      envValue(sources.get("apps/web/.env.example"), "VITE_APP_NAME"),
    slug: envValue(apiEnvironment, "APP_SLUG") ?? mobile.expo.slug,
    packageName,
    containerPrefix: containerMatch?.[1] ?? packageName,
  };
}

function readSources(root) {
  return new Map(BRAND_FILES.map((file) => [file, read(root, file)]));
}

function read(root, file) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) throw new Error(`Required branding surface is missing: ${file}`);
  return fs.readFileSync(target, "utf8");
}

function localFile(root, file, after) {
  const target = path.join(root, file);
  return {
    file,
    before: fs.existsSync(target) ? fs.readFileSync(target, "utf8") : undefined,
    after,
  };
}

function updateJson(source, update) {
  return `${JSON.stringify(update(JSON.parse(source)), null, 2)}\n`;
}

function setApiIdentity(source, options) {
  return setDeploymentIdentity(
    setEnvValue(setEnvValue(source, "APP_NAME", options.name), "APP_SLUG", options.slug),
    options,
  );
}

function setDeploymentIdentity(source, options) {
  return setEnvValue(
    setEnvValue(
      setEnvValue(setEnvValue(source, "APP_NAME", options.name), "APP_SLUG", options.slug),
      "JWT_ISSUER",
      `${options.slug}-api`,
    ),
    "JWT_AUDIENCE",
    `${options.slug}-client`,
  );
}

function setEnvValue(source, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(source) ? source.replace(pattern, line) : `${source.trimEnd()}\n${line}\n`;
}

function envValue(source, key) {
  return source.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
}

function replaceSchemaDefaults(source, identity, options) {
  return source
    .replace(
      `.default(${JSON.stringify(identity.name)})`,
      `.default(${JSON.stringify(options.name)})`,
    )
    .replace(
      `.default(${JSON.stringify(identity.slug)})`,
      `.default(${JSON.stringify(options.slug)})`,
    )
    .replace(
      `.default(${JSON.stringify(`${identity.slug}-api`)})`,
      `.default(${JSON.stringify(`${options.slug}-api`)})`,
    )
    .replace(
      `.default(${JSON.stringify(`${identity.slug}-client`)})`,
      `.default(${JSON.stringify(`${options.slug}-client`)})`,
    );
}

function replaceContainerPrefix(source, current, next) {
  return source.replace(
    new RegExp(`(container_name:\\s*)${escapeRegExp(current)}-`, "g"),
    `$1${next}-`,
  );
}

function replaceComposeIdentity(source, options) {
  return source
    .replace(/\$\{APP_NAME:-[^}]+\}/g, `\${APP_NAME:-${options.name}}`)
    .replace(/\$\{VITE_APP_NAME:-[^}]+\}/g, `\${VITE_APP_NAME:-${options.name}}`)
    .replace(/\$\{APP_SLUG:-[^}]+\}/g, `\${APP_SLUG:-${options.slug}}`)
    .replace(/\$\{JWT_ISSUER:-[^}]+\}/g, `\${JWT_ISSUER:-${options.slug}-api}`)
    .replace(/\$\{JWT_AUDIENCE:-[^}]+\}/g, `\${JWT_AUDIENCE:-${options.slug}-client}`);
}

function assertBrandOutput(sources, options) {
  const required = [
    ["README.md", `# ${options.name}`],
    ["apps/api/.env.example", `APP_NAME=${options.name}`],
    ["apps/api/.env.example", `APP_SLUG=${options.slug}`],
    ["apps/web/.env.example", `VITE_APP_NAME=${options.name}`],
    ["apps/mobile/.env.example", `EXPO_PUBLIC_APP_NAME=${options.name}`],
    ["apps/web/Dockerfile", `ARG VITE_APP_NAME=${options.name}`],
    ["packages/contracts/src/constants/index.ts", `APP_NAME = "${options.slug}"`],
    ["packages/contracts/src/schemas/env.schema.ts", `.default("${options.name}")`],
    ["packages/contracts/src/schemas/env.schema.ts", `.default("${options.slug}")`],
    ["packages/email/src/emails/WelcomeEmail.tsx", `Welcome to ${options.name}`],
    ["packages/email/src/emails/PasswordResetEmail.tsx", `Reset your ${options.name} password`],
    ["docker/observability/prometheus/prometheus.prod.yml", `service: ${options.slug}`],
    ["docker/observability/prometheus/alerts.yml", `${options.slug}-reliability`],
    ["docker/observability/prometheus/alerts.yml", `${options.slug}-.*`],
    ["docker/observability/alloy/config.alloy", `/${options.slug}-(alloy|loki)`],
    ["docker/observability/grafana/dashboards/api-overview.json", `${options.slug}-.*`],
    [".github/workflows/ci.yml", `${options.slug}-api:ci`],
  ];
  for (const [file, value] of required) requireIncludes(sources, file, value);
  for (const file of COMPOSE_FILES) {
    const names = [...sources.get(file).matchAll(/container_name:\s*([^\s]+)/g)].map(
      (match) => match[1],
    );
    if (names.some((name) => !name.startsWith(`${options.slug}-`))) {
      throw new Error(`${file} contains a container outside the ${options.slug} namespace.`);
    }
  }
  for (const file of ["docker/docker-compose.prod.yml", "docker/docker-compose.staging.yml"]) {
    requireIncludes(sources, file, `\${APP_NAME:-${options.name}}`);
    requireIncludes(sources, file, `\${APP_SLUG:-${options.slug}}`);
  }
  if (options.repositoryUrl) {
    requireIncludes(
      sources,
      "docker/observability/grafana/dashboards/database-redis.json",
      `${options.repositoryUrl}/blob/main`,
    );
  }
}

function requireIncludes(sources, file, value) {
  if (!sources.get(file).includes(value)) {
    throw new Error(`${file} did not receive expected branding value: ${value}`);
  }
}

function replaceLiteral(source, current, next, label) {
  if (!source.includes(current))
    throw new Error(`Cannot locate ${label}; branding rules have drifted.`);
  return source.replace(current, next);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function secret(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url").slice(0, 64);
}

module.exports = { BRAND_FILES, applyPlan, buildProjectPlan, createLocalEnvironmentPlan };
