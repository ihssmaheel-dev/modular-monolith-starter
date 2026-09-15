import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { createServer, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { register } from "prom-client";
import { env } from "../../config/env";
import { PinoLoggerService } from "../logger/logger.service";
import { DatabaseService } from "../database";
import { RedisService } from "../redis/redis.service";

const METRICS_PATH = "/metrics";

@Injectable()
export class WorkerMetricsServer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger: PinoLoggerService;
  private server?: Server;

  constructor(
    logger: PinoLoggerService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {
    this.logger = logger.child({ module: "WorkerMetricsServer" });
  }

  async onModuleInit(): Promise<void> {
    if (env.PROCESS_ROLE !== "worker") return;
    this.server = createServer(
      (request, response) => void this.handle(request.url, request.headers, response),
    );
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(env.WORKER_METRICS_PORT, "0.0.0.0", resolve);
    });
    this.logger.info({ port: env.WORKER_METRICS_PORT }, "Worker metrics server ready");
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private async handle(
    url: string | undefined,
    headers: Record<string, string | string[] | undefined>,
    response: ServerResponse,
  ): Promise<void> {
    if (url === "/health/live") return this.respond(response, 200, "ok\n");
    if (url === "/health/ready") return this.respondReadiness(response);
    if (url !== METRICS_PATH) return this.respond(response, 404, "not found\n");
    if (!this.isAuthorized(headers.authorization))
      return this.respond(response, 401, "unauthorized\n");
    response.writeHead(200, { "Content-Type": register.contentType });
    response.end(await register.metrics());
  }

  private isAuthorized(header: string | string[] | undefined): boolean {
    if (!env.METRICS_TOKEN) return env.NODE_ENV !== "production";
    const provided = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
    if (provided.length !== env.METRICS_TOKEN.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(env.METRICS_TOKEN));
  }

  private async respondReadiness(response: ServerResponse): Promise<void> {
    try {
      await this.database.getPool().query("SELECT 1");
      const redis = this.redis.getClient();
      if (!redis || (await redis.ping()) !== "PONG") throw new Error("dependency unavailable");
      this.respond(response, 200, "ready\n");
    } catch {
      this.respond(response, 503, "unavailable\n");
    }
  }

  private respond(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(body);
  }
}
