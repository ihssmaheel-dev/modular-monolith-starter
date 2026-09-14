import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PinoLoggerService } from "../logger/logger.service";
import type { AppHealthService } from "./health.service";
import { ShutdownService } from "./shutdown.service";

describe("ShutdownService", () => {
  let logger: { info: ReturnType<typeof vi.fn> };
  let healthService: { markDraining: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    logger = { info: vi.fn() };
    healthService = { markDraining: vi.fn() };
  });

  it("marks health service as draining on beforeApplicationShutdown", async () => {
    const service = new ShutdownService(
      logger as unknown as PinoLoggerService,
      healthService as unknown as AppHealthService,
    );

    await service.beforeApplicationShutdown("SIGTERM");

    expect(healthService.markDraining).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      { signal: "SIGTERM" },
      "Received shutdown signal. Commencing graceful teardown...",
    );
  });

  it("handles optional health service gracefully when not provided", async () => {
    const service = new ShutdownService(logger as unknown as PinoLoggerService, undefined);

    await service.beforeApplicationShutdown("SIGINT");

    expect(logger.info).toHaveBeenCalledWith(
      { signal: "SIGINT" },
      "Received shutdown signal. Commencing graceful teardown...",
    );
  });
});
