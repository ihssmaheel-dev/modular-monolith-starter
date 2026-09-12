import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import { FileReconciliationWorker } from "./file-reconciliation.worker";
import type { FilesRepository } from "../../infrastructure/repositories/files.repository";
import type { StorageService } from "../../../../infrastructure/storage/storage.service";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import type { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";

describe("FileReconciliationWorker", () => {
  let files: FilesRepository;
  let storage: StorageService;
  let database: DatabaseService;
  let worker: FileReconciliationWorker;

  beforeEach(() => {
    files = {
      findUploadedFiles: vi
        .fn()
        .mockResolvedValue([
          { id: "file-1", key: "uploads/file", fileSize: 4, contentType: "text/plain" },
        ]),
      updateById: vi.fn().mockResolvedValue(ok({ id: "file-1" })),
    } as unknown as FilesRepository;
    storage = {
      getMetadata: vi.fn().mockResolvedValue(ok({ size: 4, contentType: "text/plain" })),
    } as unknown as StorageService;
    database = {
      runTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()),
    } as unknown as DatabaseService;
    const tenantContext = {
      runSystem: vi.fn(async (_context, callback: () => Promise<unknown>) => callback()),
    } as unknown as TenantContextService;
    const metrics = { incrementCounter: vi.fn() } as unknown as MetricsService;
    const logger = {
      child: vi.fn().mockReturnThis(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as PinoLoggerService;
    worker = new FileReconciliationWorker(files, storage, database, tenantContext, metrics, logger);
  });

  it("marks an uploaded row failed when the object is missing", async () => {
    vi.mocked(storage.getMetadata).mockResolvedValueOnce(ok(null));

    await expect(worker.reconcileUploadedFiles()).resolves.toEqual({ checked: 1, repaired: 1 });
    expect(files.updateById).toHaveBeenCalledWith("file-1", { status: "failed" });
  });

  it("leaves rows untouched when storage is temporarily unavailable", async () => {
    vi.mocked(storage.getMetadata).mockResolvedValueOnce(
      err({ code: "NOT_FOUND", message: "api.error.notFound" }),
    );

    await expect(worker.reconcileUploadedFiles()).resolves.toEqual({ checked: 1, repaired: 0 });
    expect(files.updateById).not.toHaveBeenCalled();
  });
});
