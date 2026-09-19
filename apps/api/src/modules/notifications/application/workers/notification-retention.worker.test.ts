import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationRetentionWorker } from "./notification-retention.worker";
import type { DeliveryIntentsRepository } from "../../infrastructure/repositories/delivery-intents.repository";
import type { DatabaseService } from "../../../../infrastructure/database";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";

describe("NotificationRetentionWorker", () => {
  let worker: NotificationRetentionWorker;
  let intents: DeliveryIntentsRepository;
  let database: DatabaseService;
  let logger: PinoLoggerService;

  beforeEach(() => {
    intents = {
      deleteOldIntents: vi.fn().mockResolvedValue(5),
    } as unknown as DeliveryIntentsRepository;

    database = {
      runTransaction: vi.fn(async (fn: () => unknown) => await fn()),
      withSystemScope: vi.fn(async (fn: () => unknown) => await fn()),
      withExclusiveExecution: vi.fn(async (_key: string, fn: () => unknown) => ({
        executed: true,
        result: await fn(),
      })),
    } as unknown as DatabaseService;

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as PinoLoggerService;

    worker = new NotificationRetentionWorker(intents, database, logger);
  });

  it("prunes expired delivery intents and returns total pruned", async () => {
    // Return 1000 first batch, then 200 second batch (< 1000 terminates loop)
    vi.mocked(intents.deleteOldIntents).mockResolvedValueOnce(1000).mockResolvedValueOnce(200);

    const pruned = await worker.pruneExpiredIntents();

    expect(pruned).toBe(1200);
    expect(intents.deleteOldIntents).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      { totalPruned: 1200 },
      "Pruned expired notification delivery intents",
    );
  });

  it("skips execution cleanly if another worker holds the lock", async () => {
    vi.mocked(database.withExclusiveExecution).mockResolvedValue({
      executed: false,
    });

    const pruned = await worker.pruneExpiredIntents();

    expect(pruned).toBe(0);
    expect(intents.deleteOldIntents).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      {},
      "Notification retention already executing on another node, skipping",
    );
  });

  it("handles errors gracefully and returns 0", async () => {
    vi.mocked(intents.deleteOldIntents).mockRejectedValue(new Error("DB connection lost"));

    const pruned = await worker.pruneExpiredIntents();

    expect(pruned).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
