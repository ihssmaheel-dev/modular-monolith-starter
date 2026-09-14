#!/usr/bin/env node
const net = require("node:net");
const os = require("node:os");
const { execSync } = require("node:child_process");

const BOX_WIDTH = 70;

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const SERVICES = [
  { group: "APPLICATIONS", name: "API Server", port: 5156, desc: "http://localhost:5156/api" },
  { group: "APPLICATIONS", name: "Web Frontend", port: 3000, desc: "http://localhost:3000" },
  { group: "CORE INFRASTRUCTURE", name: "PostgreSQL", port: 5432, desc: "Port 5432 (drizzle)" },
  { group: "CORE INFRASTRUCTURE", name: "Redis Cache", port: 6379, desc: "Port 6379 (ioredis)" },
  { group: "CORE INFRASTRUCTURE", name: "MinIO S3 API", port: 9000, desc: "Port 9000 (S3)" },
  {
    group: "CORE INFRASTRUCTURE",
    name: "MinIO Console",
    port: 9001,
    desc: "http://localhost:9001",
  },
  { group: "CORE INFRASTRUCTURE", name: "Mailpit SMTP", port: 1025, desc: "Port 1025 (SMTP)" },
  {
    group: "CORE INFRASTRUCTURE",
    name: "Mailpit Web UI",
    port: 8025,
    desc: "http://localhost:8025",
  },
  { group: "CORE INFRASTRUCTURE", name: "pgAdmin UI", port: 5050, desc: "http://localhost:5050" },
  {
    group: "OBSERVABILITY & MONITORING",
    name: "Grafana",
    port: 3001,
    desc: "http://localhost:3001",
  },
  {
    group: "OBSERVABILITY & MONITORING",
    name: "Prometheus",
    port: 9090,
    desc: "http://localhost:9090",
  },
  {
    group: "OBSERVABILITY & MONITORING",
    name: "Loki Logs",
    port: 3100,
    desc: "http://localhost:3100",
  },
  {
    group: "OBSERVABILITY & MONITORING",
    name: "Tempo Traces",
    port: 3200,
    desc: "http://localhost:3200",
  },
  {
    group: "OBSERVABILITY & MONITORING",
    name: "Alloy Collector",
    port: 12345,
    desc: "http://localhost:12345",
  },
  {
    group: "OBSERVABILITY & MONITORING",
    name: "cAdvisor",
    port: 8080,
    desc: "http://localhost:8080",
  },
];

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

function renderBoxLine(content = "") {
  const visible = stripAnsi(content).length;
  const pad = Math.max(0, BOX_WIDTH - 2 - visible);
  return `│ ${content}${" ".repeat(pad)} │`;
}

function probePort(host, port, timeout = 750) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;

    socket.setTimeout(timeout);
    socket.once("connect", () => {
      done = true;
      const ms = Date.now() - start;
      socket.destroy();
      resolve({ host, port, ok: true, ms });
    });

    const finishError = () => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve({ host, port, ok: false });
      }
    };

    socket.once("error", finishError);
    socket.once("timeout", finishError);
    socket.connect(port, host);
  });
}

function getGitMetadata() {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
    const hash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    return `${branch}@${hash}`;
  } catch {
    return "unknown";
  }
}

function buildSystemLines() {
  const totalGb = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeGb = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const gitInfo = getGitMetadata();

  return [
    `${c.bold}${c.blue}ARCHITECTURE PLATFORM · SYSTEM TOPOLOGY & STATUS${c.reset}`,
    `${c.dim}OS:${c.reset} ${c.cyan}${os.type()} ${os.arch()}${c.reset}  ${c.dim}•${c.reset}  ${c.dim}Node:${c.reset} ${c.cyan}${process.version}${c.reset}  ${c.dim}•${c.reset}  ${c.dim}Git:${c.reset} ${c.cyan}${gitInfo}${c.reset}`,
    `${c.dim}Memory:${c.reset} ${c.cyan}${freeGb} GB free / ${totalGb} GB total${c.reset}`,
  ];
}

function renderGroup(groupName, items) {
  const lines = [`${c.bold}${c.cyan}${groupName}${c.reset}`];
  for (const item of items) {
    const badge = item.ok
      ? `${c.green}${c.bold}● ONLINE${c.reset}  ${c.dim}(${String(item.ms).padStart(2)}ms)${c.reset}`
      : `${c.red}${c.bold}○ OFFLINE${c.reset}        `;
    const nameCol = `${c.bold}${item.name.padEnd(16)}${c.reset}`;
    const portCol = `${c.dim}:${String(item.port).padEnd(5)}${c.reset}`;
    const descCol = `${c.cyan}${item.desc}${c.reset}`;
    lines.push(`  ${badge}  ${nameCol} ${portCol}  ${descCol}`);
  }
  return lines;
}

function buildSummaryLines(results) {
  const online = results.filter((r) => r.ok).length;
  const total = results.length;
  const color = online === total ? c.green : online > 0 ? c.yellow : c.red;

  return [
    `${c.bold}STATUS SUMMARY${c.reset} : ${color}${c.bold}${online}/${total} Services Online${c.reset} ${c.dim}(run 'pnpm docker:up' or 'pnpm observability:up' if offline)${c.reset}`,
  ];
}

async function main() {
  const probePromises = SERVICES.map((s) =>
    probePort("127.0.0.1", s.port).then((res) => ({ ...s, ...res })),
  );
  const results = await Promise.all(probePromises);

  const groups = [...new Set(SERVICES.map((s) => s.group))];
  const sections = [buildSystemLines()];

  for (const group of groups) {
    const groupItems = results.filter((r) => r.group === group);
    sections.push(renderGroup(group, groupItems));
  }
  sections.push(buildSummaryLines(results));

  const top = `╭${"─".repeat(BOX_WIDTH)}╮`;
  const mid = `├${"─".repeat(BOX_WIDTH)}┤`;
  const bot = `╰${"─".repeat(BOX_WIDTH)}╯`;

  const rendered = sections.map((sec) => sec.map(renderBoxLine).join("\n"));
  process.stdout.write(`\n${top}\n${rendered.join(`\n${mid}\n`)}\n${bot}\n\n`);
}

main();
