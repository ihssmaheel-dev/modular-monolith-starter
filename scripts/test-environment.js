const crypto = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const composeFile = path.join(root, "docker", "docker-compose.test.yml");
const project = `starter-test-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
const usePrebuilt = process.argv.includes("--no-build");
const apiImage = usePrebuilt ? process.env.TEST_API_IMAGE : `${project}-api`;
const webImage = usePrebuilt ? process.env.TEST_WEB_IMAGE : `${project}-web`;
const pnpmCli = process.env.npm_execpath;
const dockerEnvironment = {
  ...process.env,
  TEST_API_IMAGE: apiImage,
  TEST_WEB_IMAGE: webImage,
};

function compose(args, capture = false) {
  return spawnSync("docker", ["compose", "-p", project, "-f", composeFile, ...args], {
    cwd: root,
    env: dockerEnvironment,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
    windowsHide: true,
  });
}

function removeTestImages() {
  const result = spawnSync("docker", ["image", "rm", "--force", apiImage, webImage], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
  if (result.error) console.error(`Unable to remove test images: ${result.error.message}`);
}

function fail(result, operation) {
  if (!result.error && !result.signal && result.status === 0) return;
  console.error(`${operation} failed`, result.error?.message ?? result.signal ?? result.status);
  compose(["logs", "--no-color"]);
  process.exitCode = 1;
  return true;
}

function main() {
  try {
    if (!pnpmCli) {
      throw new Error("pnpm did not expose npm_execpath to the production test harness");
    }
    if (!apiImage || !webImage) {
      throw new Error("--no-build requires TEST_API_IMAGE and TEST_WEB_IMAGE");
    }

    if (!usePrebuilt) {
      const build = compose(["build", "api", "web", "minio"]);
      if (fail(build, "Production test image build")) return;
    }

    const up = compose([
      "up",
      "-d",
      "--no-build",
      "--pull",
      "missing",
      "--wait",
      "--wait-timeout",
      "240",
    ]);
    if (fail(up, "Production test environment startup")) return;

    const portResult = compose(["port", "gateway", "80"], true);
    if (fail(portResult, "Gateway port discovery")) return;
    const match = portResult.stdout.trim().match(/:(\d+)$/);
    if (!match) throw new Error(`Unable to parse gateway port: ${portResult.stdout}`);
    const baseUrl = `http://127.0.0.1:${match[1]}`;

    const tests = spawnSync(
      process.execPath,
      [
        pnpmCli,
        "--filter",
        "web",
        "exec",
        "playwright",
        "test",
        "--config",
        "playwright.production.config.ts",
      ],
      {
        cwd: root,
        env: { ...process.env, PRODUCTION_BASE_URL: baseUrl },
        stdio: "inherit",
        shell: false,
        windowsHide: true,
      },
    );
    fail(tests, "Production browser tests");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    compose(["down", "--volumes", "--remove-orphans"]);
    if (!usePrebuilt) removeTestImages();
  }
}

main();
