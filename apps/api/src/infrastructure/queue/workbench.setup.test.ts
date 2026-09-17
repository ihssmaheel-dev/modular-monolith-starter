import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { setupWorkbench, DEFAULT_WORKBENCH_PATH } from "./workbench.setup";
import { PinoLoggerService } from "../logger/logger.service";
import { QueueService } from "./queue.service";
import { OUTBOX_QUEUE } from "../outbox/outbox.constants";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NODE_ENV: "development",
    REDIS_URL: "redis://localhost:6379",
    WORKBENCH_ENABLED: false,
    WORKBENCH_PATH: "/ops/queues",
    WORKBENCH_USER: "ops-admin",
    WORKBENCH_PASSWORD: "super-secret-ops-password",
    WORKBENCH_READONLY: false,
    APP_NAME: "ModularMonolith",
  },
}));

vi.mock("../../config/env", () => ({
  get env() {
    return mockEnv;
  },
}));

describe("setupWorkbench", () => {
  let fastify: FastifyInstance;
  let loggerMock: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    child: ReturnType<typeof vi.fn>;
  };
  let queueServiceMock: {
    getQueue: ReturnType<typeof vi.fn>;
    getRegisteredQueues: ReturnType<typeof vi.fn>;
  };
  let mockApp: NestFastifyApplication;

  beforeEach(() => {
    mockEnv.NODE_ENV = "development";
    mockEnv.REDIS_URL = "redis://localhost:6379";
    mockEnv.WORKBENCH_ENABLED = false;
    mockEnv.WORKBENCH_PATH = "/ops/queues";
    mockEnv.WORKBENCH_USER = "ops-admin";
    mockEnv.WORKBENCH_PASSWORD = "super-secret-ops-password";
    mockEnv.WORKBENCH_READONLY = false;

    fastify = Fastify();

    loggerMock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    const dummyQueue = {
      name: "outbox",
      client: { status: "ready" },
      opts: {},
    };

    queueServiceMock = {
      getQueue: vi.fn().mockReturnValue(dummyQueue),
      getRegisteredQueues: vi.fn().mockReturnValue([dummyQueue]),
    };

    mockApp = {
      getHttpAdapter: () => ({
        getInstance: () => fastify,
      }),
      get: (token: unknown) => {
        if (token === PinoLoggerService) return loggerMock;
        if (token === QueueService) return queueServiceMock;
        return undefined;
      },
    } as unknown as NestFastifyApplication;
  });

  it("skips mounting when REDIS_URL is not configured", async () => {
    mockEnv.REDIS_URL = "";

    await setupWorkbench(mockApp);

    expect(loggerMock.debug).toHaveBeenCalledWith(
      expect.stringContaining("REDIS_URL not configured"),
    );
    expect(queueServiceMock.getQueue).not.toHaveBeenCalled();
  });

  it("skips mounting in production when WORKBENCH_ENABLED is false", async () => {
    mockEnv.NODE_ENV = "production";
    mockEnv.WORKBENCH_ENABLED = false;

    await setupWorkbench(mockApp);

    expect(loggerMock.debug).toHaveBeenCalledWith(
      expect.stringContaining("disabled in production"),
    );
    expect(queueServiceMock.getQueue).not.toHaveBeenCalled();
  });

  it("skips mounting when no queues are active/registered", async () => {
    queueServiceMock.getRegisteredQueues.mockReturnValue([]);

    await setupWorkbench(mockApp);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("no active queues found to monitor"),
    );
  });

  it("pre-registers system queues and mounts Workbench dashboard on Fastify", async () => {
    await setupWorkbench(mockApp);
    await fastify.ready();

    expect(queueServiceMock.getQueue).toHaveBeenCalledWith(OUTBOX_QUEUE);
    expect(queueServiceMock.getQueue).toHaveBeenCalledWith("email");
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({
        path: DEFAULT_WORKBENCH_PATH,
        authenticated: true,
      }),
      expect.stringContaining("BullMQ Workbench dashboard mounted"),
    );

    // Requests without trailing slash redirect to trailing slash route
    const redirectRes = await fastify.inject({
      method: "GET",
      url: DEFAULT_WORKBENCH_PATH,
    });
    expect(redirectRes.statusCode).toBe(302);
    expect(redirectRes.headers.location).toBe(`${DEFAULT_WORKBENCH_PATH}/`);

    // Unauthenticated request to protected dashboard root returns 401
    const unauthRes = await fastify.inject({
      method: "GET",
      url: `${DEFAULT_WORKBENCH_PATH}/`,
    });
    expect(unauthRes.statusCode).toBe(401);
    expect(unauthRes.headers["www-authenticate"]).toBeDefined();

    // Authenticated request returns 200 HTML with CSP headers
    const authCredentials = Buffer.from(
      `${mockEnv.WORKBENCH_USER}:${mockEnv.WORKBENCH_PASSWORD}`,
    ).toString("base64");
    const authRes = await fastify.inject({
      method: "GET",
      url: `${DEFAULT_WORKBENCH_PATH}/`,
      headers: {
        authorization: `Basic ${authCredentials}`,
      },
    });
    expect(authRes.statusCode).toBe(200);
    expect(authRes.headers["content-type"]).toContain("text/html");
    expect(authRes.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(authRes.body).toContain("Workbench");
  });

  it("handles mounting errors gracefully without throwing", async () => {
    const brokenApp = {
      getHttpAdapter: () => {
        throw new Error("Fastify instance unavailable");
      },
      get: (token: unknown) => {
        if (token === PinoLoggerService) return loggerMock;
        if (token === QueueService) return queueServiceMock;
        return undefined;
      },
    } as unknown as NestFastifyApplication;

    await expect(setupWorkbench(brokenApp)).resolves.not.toThrow();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("Failed to mount BullMQ Workbench dashboard"),
    );
  });
});
