import { INestApplication } from "@nestjs/common";

import { blue, green, yellow, bold, cyan, dim } from "colorette";
import { API_DOCS_PATH } from "@repo/contracts";
import { env } from "../../config/env";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";

const BOX_WIDTH = 64;

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
}

function renderLine(text = ""): string {
  const visible = stripAnsi(text).length;
  const padding = Math.max(0, BOX_WIDTH - 2 - visible);
  return `│ ${text}${" ".repeat(padding)} │`;
}

function buildHeaderSection(): string[] {
  const nodeInfo = `${dim("Node:")} ${cyan(process.version)}`;
  const pidInfo = `${dim("PID:")} ${cyan(String(process.pid))}`;
  const envInfo = `${dim("Env:")} ${cyan(env.NODE_ENV)}`;
  return [
    `${bold(blue("ARCHITECTURE PLATFORM · API ENGINE"))}`,
    `${envInfo}  ${dim("•")}  ${nodeInfo}  ${dim("•")}  ${pidInfo}`,
  ];
}

function buildEndpointSection(): string[] {
  return [
    `${bold(cyan("APPLICATION ENDPOINTS"))}`,
    `  ${dim("•")} ${bold("Base API")}     : ${cyan(`${env.API_URL}/api`)}`,
    `  ${dim("•")} ${bold("Swagger Docs")} : ${cyan(`${env.API_URL}${API_DOCS_PATH}`)}`,
    `  ${dim("•")} ${bold("Health Probe")} : ${cyan(`${env.API_URL}/health`)}`,
    `  ${dim("•")} ${bold("Prom Metrics")} : ${cyan(`${env.API_URL}/metrics`)}`,
  ];
}

function getStorageLabel(): string {
  if (env.STORAGE_DRIVER === "s3" && env.S3_ENDPOINT?.includes("localhost")) {
    return `${cyan("S3 / MinIO")} ${dim("(UI: :9001)")}`;
  }
  return cyan(env.STORAGE_DRIVER.toUpperCase());
}

function getEmailLabel(): string {
  if (env.EMAIL_DRIVER === "smtp" && env.SMTP_HOST?.includes("localhost")) {
    return `${cyan("SMTP / Mailpit")} ${dim("(UI: :8025)")}`;
  }
  return cyan(env.EMAIL_DRIVER.toUpperCase());
}

function buildInfraSection(app: INestApplication): string[] {
  const redis = app.get(RedisService, { strict: false });
  const redisConnected = !!redis?.getClient();
  const redisStatus = redisConnected ? green("[OK] Connected") : yellow("[!] Optional");

  return [
    `${bold(cyan("CORE INFRASTRUCTURE"))}`,
    `  ${dim("•")} ${bold("PostgreSQL")}   : ${green("[OK] Connected")} ${dim("(drizzle)")}`,
    `  ${dim("•")} ${bold("Redis Cache")}  : ${redisStatus}`,
    `  ${dim("•")} ${bold("Object Store")} : ${getStorageLabel()}`,
    `  ${dim("•")} ${bold("Email Driver")} : ${getEmailLabel()}`,
  ];
}

function buildObservabilitySection(): string[] {
  return [
    `${bold(cyan("OBSERVABILITY & MONITORING"))}`,
    `  ${dim("•")} ${bold("Grafana")}      : ${cyan("http://localhost:3001")} ${dim("(Dashboards)")}`,
    `  ${dim("•")} ${bold("Prometheus")}   : ${cyan("http://localhost:9090")} ${dim("(Engine)")}`,
    `  ${dim("•")} ${bold("Loki Logs")}    : ${cyan("http://localhost:3100")} ${dim("(Streams)")}`,
    `  ${dim("•")} ${bold("Tempo Traces")} : ${cyan("http://localhost:3200")} ${dim("(Tracing)")}`,
    `  ${dim("•")} ${bold("cAdvisor")}     : ${cyan("http://localhost:8080")} ${dim("(Containers)")}`,
  ];
}

function formatBanner(sections: string[][]): string {
  const top = `╭${"─".repeat(BOX_WIDTH)}╮`;
  const mid = `├${"─".repeat(BOX_WIDTH)}┤`;
  const bot = `╰${"─".repeat(BOX_WIDTH)}╯`;

  const renderedSections = sections.map((sec) => sec.map(renderLine).join("\n"));
  return [top, renderedSections.join(`\n${mid}\n`), bot].join("\n");
}

export function printStartupBanner(app: INestApplication, logger: PinoLoggerService): void {
  const sections = [
    buildHeaderSection(),
    buildEndpointSection(),
    buildInfraSection(app),
    buildObservabilitySection(),
  ];

  const banner = formatBanner(sections);
  process.stdout.write(`\n${banner}\n\n`);
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API startup banner displayed");
}
