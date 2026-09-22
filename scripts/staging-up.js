const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runStagingUp(options = {}) {
  const root = options.root ?? path.resolve(__dirname, "..");
  const spawn = options.spawn ?? spawnSync;
  const privateEnv = path.join(root, "docker", ".env.staging");
  const exampleEnv = path.join(root, "docker", ".env.staging.example");
  const envFile = fs.existsSync(privateEnv) ? privateEnv : exampleEnv;
  const composeFile = path.join(root, "docker", "docker-compose.staging.yml");

  const result = spawn(
    "docker",
    ["compose", "-f", composeFile, "--env-file", envFile, "up", "-d", "--wait"],
    { cwd: root, stdio: "inherit", shell: false, windowsHide: true },
  );
  if (result.error) {
    console.error(`Unable to start Docker Compose: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`Docker Compose terminated by signal ${result.signal}`);
    return 1;
  }
  return typeof result.status === "number" ? result.status : 1;
}

if (require.main === module) process.exitCode = runStagingUp();

module.exports = { runStagingUp };
