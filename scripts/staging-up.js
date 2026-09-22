// Starts STAGING environment, prioritizing docker/.env.staging over the example file.
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const envFile = fs.existsSync("docker/.env.staging")
  ? "docker/.env.staging"
  : "docker/.env.staging.example";

const result = spawnSync(
  "docker",
  [
    "compose",
    "-f",
    "docker/docker-compose.staging.yml",
    "--env-file",
    envFile,
    "up",
    "-d",
    "--wait",
  ],
  { stdio: "inherit", shell: true },
);

process.exit(result.status ?? 0);
