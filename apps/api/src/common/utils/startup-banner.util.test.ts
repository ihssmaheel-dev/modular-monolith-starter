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

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ port: expect.any(Number) }),
      "API startup banner displayed",
    );

    writeSpy.mockRestore();
  });
});
