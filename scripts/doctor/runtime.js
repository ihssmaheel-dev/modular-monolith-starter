const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;
const PORT_PROBE_TIMEOUT_MS = 1_000;

function runProcess(command, args, timeout = DEFAULT_COMMAND_TIMEOUT_MS) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runPnpmVersion() {
  return runPnpmCommand(["--version"]);
}

function runPnpmNodeVersion() {
  return runPnpmCommand(["exec", "node", "--version"]);
}

function runPnpmCommand(args) {
  const pnpmEntry = process.env.npm_execpath;
  if (pnpmEntry && fs.existsSync(pnpmEntry)) {
    return runProcess(process.execPath, [pnpmEntry, ...args]);
  }
  if (process.platform === "win32") {
    return runProcess(process.env.ComSpec || "cmd.exe", [
      "/d",
      "/s",
      "/c",
      `pnpm ${args.join(" ")}`,
    ]);
  }
  return runProcess("pnpm", args);
}

function parseVersion(value) {
  const match = String(value)
    .trim()
    .match(/v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readEnv(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  const values = {};
  for (const rawLine of fs.readFileSync(absolutePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line
      .slice(0, separator)
      .trim()
      .replace(/^export\s+/, "");
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function probePort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(PORT_PROBE_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.connect(port, host);
  });
}

function commandDetail(result) {
  if (result.error?.code === "ETIMEDOUT") return "command timed out";
  if (result.error?.code === "ENOENT") return "command was not found";
  const detail = String(result.stderr || result.stdout || result.error?.message || "").trim();
  return detail.split(/\r?\n/).find(Boolean) || `exit code ${result.status ?? "unknown"}`;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GiB`;
}

module.exports = {
  ROOT,
  commandDetail,
  compareVersions,
  formatBytes,
  parseVersion,
  probePort,
  readEnv,
  readJson,
  runPnpmVersion,
  runPnpmNodeVersion,
  runProcess,
};
