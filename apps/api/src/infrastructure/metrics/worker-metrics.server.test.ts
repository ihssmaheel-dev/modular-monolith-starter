import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ServerResponse } from "node:http";
import { WorkerMetricsServer } from "./worker-metrics.server";
import type { PinoLoggerService } from "../logger/logger.service";
import type { DatabaseService } from "../database";
import type { RedisService } from "../redis/redis.service";
import { register } from "prom-client";

vi.mock("../../config/env", () => ({
  env: {
    PROCESS_ROLE: "worker",
    WORKER_METRICS_PORT: 9464,
    METRICS_TOKEN: "valid-secret-token-32-chars-long",
    NODE_ENV: "production",
  },
}));

describe("WorkerMetricsServer", () => {
  let server: WorkerMetricsServer;
  let mockLogger: PinoLoggerService;
  let mockDatabase: DatabaseService;
  let mockRedis: RedisService;
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockPing: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      child: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    } as unknown as PinoLoggerService;

    mockQuery = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    mockDatabase = {
      getPool: vi.fn().mockReturnValue({ query: mockQuery }),
    } as unknown as DatabaseService;

    mockPing = vi.fn().mockResolvedValue("PONG");
    mockRedis = {
      getClient: vi.fn().mockReturnValue({ ping: mockPing }),
    } as unknown as RedisService;

    server = new WorkerMetricsServer(mockLogger, mockDatabase, mockRedis);
  });

  function createMockResponse(): ServerResponse & {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  } {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: "",
      headersSent: false,
      writeHead(status: number, headers?: Record<string, string>) {
        this.statusCode = status;
        if (headers) Object.assign(this.headers, headers);
        this.headersSent = true;
        return this;
      },
      end(chunk?: string) {
        if (chunk) this.body += chunk;
        return this;
      },
    };
    return res as unknown as ServerResponse & {
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    };
  }

  type ServerWithPrivateHandle = {
    handle: (
      url: string | undefined,
      headers: Record<string, string | string[] | undefined>,
      response: ServerResponse,
    ) => Promise<void>;
  };

  it("responds with 200 ok for /health/live", async () => {
    const res = createMockResponse();
    await (server as unknown as ServerWithPrivateHandle).handle("/health/live", {}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("ok\n");
  });

  it("responds with 200 ready for /health/ready when dependencies are healthy", async () => {
    const res = createMockResponse();
    await (server as unknown as ServerWithPrivateHandle).handle("/health/ready", {}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("ready\n");
  });

  it("responds with 503 unavailable for /health/ready when database is down", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Connection refused"));
    const res = createMockResponse();
    await (server as unknown as ServerWithPrivateHandle).handle("/health/ready", {}, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toBe("unavailable\n");
  });

  it("responds with 503 unavailable for /health/ready when redis is down", async () => {
    mockPing.mockRejectedValueOnce(new Error("Redis disconnected"));
    const res = createMockResponse();
    await (server as unknown as ServerWithPrivateHandle).handle("/health/ready", {}, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toBe("unavailable\n");
  });

  it("responds with 404 for unknown endpoints", async () => {
    const res = createMockResponse();
    await (server as unknown as ServerWithPrivateHandle).handle("/unknown", {}, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe("not found\n");
  });

  it("rejects with 401 when authorization header is missing on /metrics", async () => {
    const res = createMockResponse();
    await (server as unknown as ServerWithPrivateHandle).handle("/metrics", {}, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toBe("unauthorized\n");
  });

  it("rejects with 401 and does not throw when authorization has matching char length but different byte length", async () => {
    const multiByteHeader = `Bearer ${"🚀".repeat(16)}`;
    const res = createMockResponse();

    await expect(
      (server as unknown as ServerWithPrivateHandle).handle(
        "/metrics",
        { authorization: multiByteHeader },
        res,
      ),
    ).resolves.not.toThrow();

    expect(res.statusCode).toBe(401);
    expect(res.body).toBe("unauthorized\n");
  });

  it("serves metrics with 200 when valid bearer token is provided", async () => {
    const metricsSpy = vi.spyOn(register, "metrics").mockResolvedValueOnce("# HELP ...\n");
    const res = createMockResponse();

    await (server as unknown as ServerWithPrivateHandle).handle(
      "/metrics",
      { authorization: "Bearer valid-secret-token-32-chars-long" },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("# HELP ...\n");
    expect(metricsSpy).toHaveBeenCalled();
  });

  it("rejects when register.metrics() fails without committing headers", async () => {
    vi.spyOn(register, "metrics").mockRejectedValueOnce(new Error("Metrics collection failed"));
    const res = createMockResponse();

    await expect(
      (server as unknown as ServerWithPrivateHandle).handle(
        "/metrics",
        { authorization: "Bearer valid-secret-token-32-chars-long" },
        res,
      ),
    ).rejects.toThrow("Metrics collection failed");

    expect(res.headersSent).toBe(false);
  });
});
