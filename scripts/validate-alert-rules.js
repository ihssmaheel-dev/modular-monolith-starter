const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const rulesDirectory = path
  .join(root, "docker", "observability", "prometheus")
  .replaceAll("\\", "/");
const image = "prom/prometheus:v2.55.1";

for (const args of [
  ["check", "rules", "/rules/alerts.yml"],
  ["test", "rules", "/rules/tests/alerts.test.yml"],
]) {
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--entrypoint",
      "promtool",
      "-v",
      `${rulesDirectory}:/rules:ro`,
      image,
      ...args,
    ],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    console.error(`Unable to start promtool: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`promtool terminated by signal ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
