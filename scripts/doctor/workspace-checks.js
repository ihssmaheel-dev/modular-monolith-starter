const fs = require("node:fs");
const path = require("node:path");
const { ROOT, commandDetail, readJson, runProcess } = require("./runtime");
const { result } = require("./result");

const REQUIRED_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "docker/docker-compose.yml",
  "apps/api/.env.example",
  "apps/web/.env.example",
  "apps/mobile/.env.example",
];

function checkWorkspace(results, options) {
  const missing = REQUIRED_FILES.filter((file) => !fs.existsSync(path.join(ROOT, file)));
  results.push(
    result(
      "Workspace",
      "required-files",
      "Repository files",
      missing.length === 0 ? "pass" : "fail",
      missing.length === 0
        ? `${REQUIRED_FILES.length} required files present`
        : `missing: ${missing.join(", ")}`,
      missing.length === 0 ? undefined : "Restore the missing tracked files from Git.",
    ),
  );

  const installed = fs.existsSync(path.join(ROOT, "node_modules/.pnpm"));
  results.push(
    result(
      "Workspace",
      "dependencies",
      "Dependencies",
      installed ? "pass" : "fail",
      installed ? "pnpm virtual store is present" : "node_modules/.pnpm is missing",
      installed ? undefined : "Run `pnpm install --frozen-lockfile`.",
    ),
  );

  checkWorkspaceManifests(results);
  checkNodeScript(
    results,
    "migration-lineage",
    "Migration lineage",
    "scripts/verify-migration-lineage.js",
  );
  if (options.skipServices) {
    results.push(
      result(
        "Workspace",
        "observability-config",
        "Observability configuration",
        "skip",
        "Docker-backed validation disabled by --skip-services",
      ),
    );
  } else {
    checkNodeScript(
      results,
      "observability-config",
      "Observability configuration",
      "scripts/validate-observability-config.js",
      20_000,
    );
  }
}

function checkWorkspaceManifests(results) {
  const manifestPaths = [];
  for (const parent of ["apps", "packages"]) {
    const parentPath = path.join(ROOT, parent);
    if (!fs.existsSync(parentPath)) continue;
    for (const entry of fs.readdirSync(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(parent, entry.name);
      // Optional non-Node services are validated by their own toolchain.
      if (fs.existsSync(path.join(ROOT, directory, "pyproject.toml"))) continue;
      manifestPaths.push(path.join(directory, "package.json"));
    }
  }
  const names = new Map();
  const invalid = [];
  for (const manifestPath of manifestPaths) {
    try {
      const manifest = readJson(manifestPath);
      if (!manifest.name) invalid.push(`${manifestPath} has no name`);
      else if (names.has(manifest.name)) invalid.push(`${manifest.name} is duplicated`);
      else names.set(manifest.name, manifestPath);
    } catch {
      invalid.push(`${manifestPath} is invalid JSON`);
    }
  }
  results.push(
    result(
      "Workspace",
      "workspace-manifests",
      "Workspace manifests",
      invalid.length === 0 ? "pass" : "fail",
      invalid.length === 0
        ? `${manifestPaths.length} unique workspace packages`
        : invalid.join("; "),
      invalid.length === 0
        ? undefined
        : "Repair package names and JSON before running pnpm commands.",
    ),
  );
}

function checkNodeScript(results, id, name, relativePath, timeout = 10_000) {
  const executed = runProcess(process.execPath, [path.join(ROOT, relativePath)], timeout);
  results.push(
    result(
      "Workspace",
      id,
      name,
      executed.status === 0 ? "pass" : "fail",
      executed.status === 0 ? "repository validation passed" : commandDetail(executed),
      executed.status === 0 ? undefined : `Run \`node ${relativePath}\` for full diagnostics.`,
    ),
  );
}

module.exports = { checkWorkspace };
