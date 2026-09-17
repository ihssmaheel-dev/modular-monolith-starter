import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env";
import type { DatabaseService } from "../../database";
import type { PinoLoggerService } from "../../logger/logger.service";
import { AuditRetentionWorker } from "./audit-retention.worker";

describe("AuditRetentionWorker", () => {
  const originalRole = env.PROCESS_ROLE;
  const originalDays = env.AUDIT_RETENTION_DAYS;
  let execute: ReturnType<typeof vi.fn>;
  let database: DatabaseService;
  let worker: AuditRetentionWorker;

  beforeEach(() => {
    env.PROCESS_ROLE = "worker";
    execute = vi.fn().mockResolvedValue({ rows: [{ purged: "3" }] });
    database = {
      withSystemScope: vi.fn(async (callback) => callback()),
      runTransaction: vi.fn(async (callback) => callback()),
      getTx: vi.fn(() => ({ execute })),
      getDb: vi.fn(),
    } as unknown as DatabaseService;
    const logger = { child: vi.fn().mockReturnThis(), info: vi.fn(), error: vi.fn() };
    worker = new AuditRetentionWorker(database, logger as unknown as PinoLoggerService);
  });

  afterEach(() => {
    env.PROCESS_ROLE = originalRole;
    env.AUDIT_RETENTION_DAYS = originalDays;
  });

  it("purges through the protected database function", async () => {
    await expect(worker.purgeExpiredLogs()).resolves.toBe(3);
    expect(database.withSystemScope).toHaveBeenCalled();
    expect(database.runTransaction).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not run in the API process", async () => {
    env.PROCESS_ROLE = "api";
    await expect(worker.purgeExpiredLogs()).resolves.toBe(0);
    expect(database.withSystemScope).not.toHaveBeenCalled();
  });
});
