const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MINIMUM_NODE_MAJOR = 20;
const ENV_FILES = [
  ["apps/api/.env.example", "apps/api/.env"],
  ["apps/web/.env.example", "apps/web/.env"],
];

function main() {
  try {
    verifyPrerequisites();
    createEnvironmentFiles();
    run("pnpm", ["install", "--frozen-lockfile"]);
    run("pnpm", ["docker:up"]);
    run("pnpm", ["docker:init"]);
    verifyFreshDatabase();
    run("pnpm", ["db:migrate"]);
    run("pnpm", ["build"]);
    process.stdout.write("\nBootstrap complete. Run `pnpm dev` to start development.\n");
  } catch (error) {
    process.stderr.write(`\nBootstrap failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

function verifyPrerequisites() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < MINIMUM_NODE_MAJOR) {
    throw new Error(`Node.js ${MINIMUM_NODE_MAJOR}+ is required.`);
  }
  verifyPnpm();
  verifyCompose();
  verifyDockerDaemon();
}

function verifyPnpm() {
  const result = execute("pnpm", ["--version"], "pipe");
  const major = Number(result.stdout?.toString().trim().split(".")[0]);
  if (result.error || result.status !== 0 || major < 9) {
    throw new Error("pnpm 10.34.5 is required. Enable the repository version with Corepack.");
  }
}

function verifyCompose() {
  const version = execute("docker", ["compose", "version"], "ignore", undefined, 5000);
  const help = execute("docker", ["compose", "up", "--help"], "pipe", undefined, 5000);
  const supportsWait = help.stdout?.toString().includes("--wait");
  if (version.error || version.status !== 0 || !supportsWait) {
    throw new Error("Docker with Compose v2.17+ is required.");
  }
}

function verifyDockerDaemon() {
  const result = execute("docker", ["info"], "ignore", undefined, 5000);
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(
      "Docker daemon is not responding (connection timed out).\n" +
        "Ensure Docker Desktop is open and the engine is fully running (green icon in Docker Desktop) before running `pnpm bootstrap`.",
    );
  }
  if (result.error || result.status !== 0) {
    throw new Error(
      "Docker daemon is not running or accessible.\n" +
        "Please start Docker Desktop and ensure the engine has started before running `pnpm bootstrap`.",
    );
  }
}

function generateSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url").slice(0, 64);
}

function verifyFreshDatabase() {
  const result = execute(
    "docker",
    [
      "compose",
      "-f",
      "docker/docker-compose.yml",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "app",
      "-tAc",
      "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'",
    ],
    "pipe",
    false,
  );
  const count = Number(result.stdout?.toString().trim());
  if (result.error || result.status !== 0 || Number.isNaN(count)) {
    throw new Error("Could not verify the database is empty. Is Postgres running?");
  }
  if (count > 0) {
    throw new Error(
      "The local database already contains tables. Bootstrap expects a fresh database: " +
        "run `docker compose -f docker/docker-compose.yml down -v` to reset local volumes " +
        "and re-run `pnpm bootstrap`, or run `pnpm db:migrate` directly to migrate the existing database.",
    );
  }
}

function createEnvironmentFiles() {
  for (const [template, destination] of ENV_FILES) {
    const target = path.join(ROOT, destination);
    if (fs.existsSync(target)) {
      process.stdout.write(`Preserved ${destination}\n`);
      continue;
    }
    let content = fs.readFileSync(path.join(ROOT, template), "utf8");
    if (destination === "apps/api/.env") {
      const jwtSecret = generateSecret(48);
      let refreshSecret = generateSecret(48);
      while (refreshSecret === jwtSecret) refreshSecret = generateSecret(48);
      const metricsToken = generateSecret(32);
      content = content
        .replace("your-super-secret-jwt-key-change-in-prod", jwtSecret)
        .replace("your-separate-refresh-secret-change-in-prod", refreshSecret)
        .replace("optional-development-metrics-token-32chars", metricsToken);
    }
    fs.writeFileSync(target, content, "utf8");
    process.stdout.write(`Created ${destination} with generated secrets\n`);
  }
}

function run(command, args) {
  process.stdout.write(`\n> ${command} ${args.join(" ")}\n`);
  const result = execute(command, args, "inherit");
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}.`);
}

function execute(command, args, stdio, shell = process.platform === "win32", timeout = 0) {
  const options = {
    cwd: ROOT,
    stdio,
    shell,
    ...(timeout > 0 ? { timeout } : {}),
  };
  if (shell && Array.isArray(args) && args.length > 0) {
    const fullCommand = [command, ...args].join(" ");
    return spawnSync(fullCommand, options);
  }
  return spawnSync(command, args, options);
}

main();
