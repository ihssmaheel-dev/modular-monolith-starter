const fs = require("node:fs");
const os = require("node:os");
const {
  ROOT,
  commandDetail,
  compareVersions,
  formatBytes,
  parseVersion,
  readJson,
  runPnpmVersion,
  runPnpmNodeVersion,
  runProcess,
} = require("./runtime");
const { result } = require("./result");

const MINIMUM_COMPOSE_VERSION = [2, 17, 0];
const MINIMUM_MEMORY_BYTES = 8 * 1024 ** 3;
const LOW_FREE_MEMORY_BYTES = 1.5 * 1024 ** 3;
const LOW_FREE_DISK_BYTES = 5 * 1024 ** 3;

function checkToolchain(results, options) {
  const rootPackage = readJson("package.json");
  const expectedPnpm = rootPackage.packageManager?.split("@")[1];
  const expectedNodeText = fs.readFileSync(`${ROOT}/.node-version`, "utf8").trim();
  const expectedNode = parseVersion(expectedNodeText);
  const currentNode = parseVersion(process.versions.node);
  const nodeOk = currentNode && expectedNode && compareVersions(currentNode, expectedNode) === 0;
  results.push(
    result(
      "Toolchain",
      "node-version",
      "Node.js",
      nodeOk ? "pass" : "fail",
      `${process.version} ${nodeOk ? "matches" : "does not match"} the ${expectedNodeText} pin`,
      nodeOk ? undefined : `Install the pinned Node.js ${expectedNodeText} runtime.`,
    ),
  );

  const pnpmNode = runPnpmNodeVersion();
  const pnpmNodeVersion = parseVersion(pnpmNode.stdout);
  const pnpmNodeOk =
    pnpmNode.status === 0 &&
    expectedNode &&
    pnpmNodeVersion &&
    compareVersions(pnpmNodeVersion, expectedNode) === 0;
  results.push(
    result(
      "Toolchain",
      "pnpm-node-version",
      "pnpm-spawned Node.js",
      pnpmNodeOk ? "pass" : "fail",
      pnpmNodeOk
        ? `${pnpmNode.stdout.trim()} matches the runtime pin`
        : `${pnpmNode.stdout.trim() || commandDetail(pnpmNode)} does not match ${expectedNodeText}`,
      pnpmNodeOk ? undefined : "Repair Corepack/PATH so pnpm and the shell use the same Node.js.",
    ),
  );

  const pnpm = runPnpmVersion();
  const actualPnpm = String(pnpm.stdout || "").trim();
  const pnpmOk = pnpm.status === 0 && actualPnpm === expectedPnpm;
  results.push(
    result(
      "Toolchain",
      "pnpm-version",
      "pnpm",
      pnpmOk ? "pass" : "fail",
      pnpmOk
        ? `${actualPnpm} matches packageManager`
        : `expected ${expectedPnpm || "the packageManager pin"}; ${actualPnpm || commandDetail(pnpm)}`,
      pnpmOk
        ? undefined
        : `Run \`corepack enable\` and \`corepack prepare pnpm@${expectedPnpm} --activate\`.`,
    ),
  );

  const git = runProcess("git", ["--version"]);
  results.push(
    result(
      "Toolchain",
      "git",
      "Git",
      git.status === 0 ? "pass" : "fail",
      git.status === 0 ? git.stdout.trim() : commandDetail(git),
      git.status === 0 ? undefined : "Install Git and ensure it is available on PATH.",
    ),
  );

  if (options.skipServices) {
    results.push(
      result(
        "Toolchain",
        "docker-compose",
        "Docker Compose",
        "skip",
        "service checks disabled by --skip-services",
      ),
    );
  } else checkDockerToolchain(results);
}

function checkDockerToolchain(results) {
  const compose = runProcess("docker", ["compose", "version"], 5_000);
  const composeVersion = parseVersion(compose.stdout);
  const composeOk =
    compose.status === 0 &&
    composeVersion &&
    compareVersions(composeVersion, MINIMUM_COMPOSE_VERSION) >= 0;
  results.push(
    result(
      "Toolchain",
      "docker-compose",
      "Docker Compose",
      composeOk ? "pass" : "fail",
      composeOk ? compose.stdout.trim() : commandDetail(compose),
      composeOk ? undefined : "Install Docker with Compose v2.17 or newer.",
    ),
  );
  if (!composeOk) return;

  const config = runProcess(
    "docker",
    ["compose", "-f", "docker/docker-compose.yml", "config", "--quiet"],
    10_000,
  );
  results.push(
    result(
      "Toolchain",
      "compose-config",
      "Compose configuration",
      config.status === 0 ? "pass" : "fail",
      config.status === 0 ? "local Compose configuration is valid" : commandDetail(config),
      config.status === 0 ? undefined : "Fix docker/docker-compose.yml before starting services.",
    ),
  );

  const daemon = runProcess("docker", ["info", "--format", "{{.ServerVersion}}"], 7_500);
  results.push(
    result(
      "Toolchain",
      "docker-daemon",
      "Docker daemon",
      daemon.status === 0 ? "pass" : "fail",
      daemon.status === 0 ? `engine ${daemon.stdout.trim()} is reachable` : commandDetail(daemon),
      daemon.status === 0 ? undefined : "Start Docker Desktop or the Docker engine, then retry.",
    ),
  );
}

function checkSystemCapacity(results) {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const memoryStatus =
    totalMemory < MINIMUM_MEMORY_BYTES || freeMemory < LOW_FREE_MEMORY_BYTES ? "warn" : "pass";
  results.push(
    result(
      "System",
      "memory",
      "Memory",
      memoryStatus,
      `${formatBytes(freeMemory)} free of ${formatBytes(totalMemory)}`,
      memoryStatus === "warn"
        ? "Close unused development services and keep a system-managed page file enabled before builds."
        : undefined,
    ),
  );

  if (typeof fs.statfsSync !== "function") {
    results.push(result("System", "disk", "Workspace disk", "skip", "disk statistics unavailable"));
    return;
  }
  const disk = fs.statfsSync(ROOT);
  const freeDisk = Number(disk.bavail) * Number(disk.bsize);
  const lowDisk = freeDisk < LOW_FREE_DISK_BYTES;
  results.push(
    result(
      "System",
      "disk",
      "Workspace disk",
      lowDisk ? "warn" : "pass",
      `${formatBytes(freeDisk)} available`,
      lowDisk
        ? "Free at least 5 GiB for dependencies, Turbo caches, builds, and container layers."
        : undefined,
    ),
  );
}

module.exports = { checkSystemCapacity, checkToolchain };
