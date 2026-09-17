import { describe, expect, it, vi } from "vitest";
import { INestApplication } from "@nestjs/common";
import { printStartupBanner } from "./startup-banner.util";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";
import { RedisService } from "../../infrastructure/redis/redis.service";

describe("printStartupBanner", () => {
  it("renders the startup banner with all sections", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const mockRedis = { getClient: vi.fn().mockReturnValue({}) } as unknown as RedisService;
    const mockApp = {
      get: vi.fn().mockReturnValue(mockRedis),
    } as unknown as INestApplication;
    const mockLogger = {
      info: vi.fn(),
    } as unknown as PinoLoggerService;

    printStartupBanner(mockApp, mockLogger);

    expect(writeSpy).toHaveBeenCalled();
    const output = String(writeSpy.mock.calls[0]?.[0] ?? "");

    expect(output).toContain("ARCHITECTURE PLATFORM · API ENGINE");
    expect(output).toContain("APPLICATION ENDPOINTS");
    expect(output).toContain("CORE INFRASTRUCTURE");
    expect(output).toContain("OBSERVABILITY & MONITORING");
    expect(output).toContain("PostgreSQL");
    expect(output).toContain("Redis Cache");
    expect(output).toContain("Grafana");
    expect(output).toContain("Prometheus");
    expect(output).toContain("Loki Logs");
    expect(output).toContain("Tempo Traces");
    expect(output).toContain("cAdvisor");

    expect(output).toContain("BullMQ UI");
    expect(output).toContain("BullMQ Engine");
    expect(output).toContain("BullMQ Board");
    expect(output).toContain("/ops/queues");

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ port: expect.any(Number) }),
      "API startup banner displayed",
    );

    writeSpy.mockRestore();
  });

  it("renders active BullMQ Workbench details when QueueService is available", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const mockRedis = { getClient: vi.fn().mockReturnValue({}) } as unknown as RedisService;
    const mockQueueService = {
      getRegisteredQueues: vi.fn().mockReturnValue([{ name: "outbox" }, { name: "email" }]),
    };
    const mockApp = {
      get: vi.fn((token: unknown) => {
        if (token === RedisService) return mockRedis;
        return mockQueueService;
      }),
    } as unknown as INestApplication;
    const mockLogger = {
      info: vi.fn(),
    } as unknown as PinoLoggerService;

    printStartupBanner(mockApp, mockLogger);

    expect(writeSpy).toHaveBeenCalled();
    const output = String(writeSpy.mock.calls[0]?.[0] ?? "");

    expect(output).toContain("Workbench");
    expect(output).toContain("/ops/queues");
    expect(output).toContain("outbox, email");
    expect(output).toContain("Read-Only");

    writeSpy.mockRestore();
  });
});
