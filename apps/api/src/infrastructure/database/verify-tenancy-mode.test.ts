import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { verifyTenancyMode } from "./verify-tenancy-mode";
import type { DatabaseService } from "./database.service";
import type { PinoLoggerService } from "../logger/logger.service";
import { env } from "../../config/env";

describe("verifyTenancyMode", () => {
  const originalMode = env.TENANCY_MODE;
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as PinoLoggerService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    env.TENANCY_MODE = originalMode;
  });

  function databaseWithCount(count: string) {
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [{ count }] }),
    };
    return {
      withSystemScope: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      getTx: vi.fn(() => tx),
      getDb: vi.fn(() => {
        throw new Error("getDb must not be used inside the system scope");
      }),
    } as unknown as DatabaseService;
  }

  it("reads the count through the scoped transaction, not the pool handle", async () => {
    env.TENANCY_MODE = "single";
    const database = databaseWithCount("0");

    await expect(verifyTenancyMode(database, logger)).resolves.toBeUndefined();
    expect(database.getTx).toHaveBeenCalled();
  });

  it("refuses to boot when organizations exist in single-tenant mode", async () => {
    env.TENANCY_MODE = "single";
    const database = databaseWithCount("3");

    await expect(verifyTenancyMode(database, logger)).rejects.toThrow("TENANCY_MODE_MISMATCH");
    expect(logger.error).toHaveBeenCalledWith(
      { organizationCount: 3 },
      expect.stringContaining("Refusing to boot"),
    );
  });

  it("fails loud when no scoped transaction is available", async () => {
    env.TENANCY_MODE = "single";
    const database = {
      withSystemScope: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      getTx: vi.fn(() => undefined),
      getDb: vi.fn(() => ({})),
    } as unknown as DatabaseService;

    // A silent zero count would skip the safety check; fail instead.
    await expect(verifyTenancyMode(database, logger)).rejects.toThrow(
      "TENANCY_MODE_CHECK_REQUIRES_TRANSACTION",
    );
  });

  it("skips the check outside single-tenant mode", async () => {
    env.TENANCY_MODE = "multi";
    const database = databaseWithCount("3");

    await expect(verifyTenancyMode(database, logger)).resolves.toBeUndefined();
  });
});
