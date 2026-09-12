import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileCleanupWorker } from "./file-cleanup.worker";
import type { FilesRepository } from "../../infrastructure/repositories/files.repository";
import type { StorageService } from "../../../../infrastructure/storage/storage.service";
import type { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { FileEntity } from "../../domain/entities/file.entity";

describe("FileCleanupWorker", () => {
  let worker: FileCleanupWorker;
  let mockFilesRepo: FilesRepository;
  let mockStorage: StorageService;
  let mockMetrics: MetricsService;
  let mockLogger: PinoLoggerService;
  let mockDatabase: import("../../../../infrastructure/database").DatabaseService;

  const STALE_FILE: FileEntity = {
    id: "file-stale-1",
    key: "uploads/stale.png",
    fileName: "stale.png",
    contentType: "image/png",
    fileSize: 1024,
    bucket: "test-bucket",
    parentType: "general",
    uploadedBy: "user-1",
    status: "pending",
    createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
  };

  beforeEach(() => {
    mockFilesRepo = {
      findPendingFilesBefore: vi.fn().mockResolvedValue([STALE_FILE]),
      findUnlinkedBefore: vi.fn().mockResolvedValue([]),
      deleteById: vi.fn().mockResolvedValue({ isOk: () => true, value: STALE_FILE }),
    } as unknown as FilesRepository;

    mockStorage = {
      delete: vi.fn().mockResolvedValue({ isOk: () => true, isErr: () => false }),
    } as unknown as StorageService;

    mockMetrics = {
      incrementCounter: vi.fn(),
    } as unknown as MetricsService;

    mockLogger = {
      child: vi.fn().mockReturnThis(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as PinoLoggerService;

    const mockTenantContext = {
      runSystem: vi.fn(async (_ctx, fn) => await fn()),
    } as unknown as import("../../../../infrastructure/database").TenantContextService;
    mockDatabase = {
      runTransaction: vi.fn(async (fn) => await fn()),
    } as unknown as import("../../../../infrastructure/database").DatabaseService;

    worker = new FileCleanupWorker(
      mockFilesRepo,
      mockStorage,
      mockMetrics,
      mockTenantContext,
      mockDatabase,
      mockLogger,
    );
  });

  it("identifies and purges stale pending files older than cutoff", async () => {
    const result = await worker.cleanupOrphanPendingFiles();

    expect(result.purgedCount).toBe(1);
    expect(result.reclaimedBytes).toBe(1024);
    expect(mockStorage.delete).toHaveBeenCalledWith(STALE_FILE.key);
    expect(mockFilesRepo.deleteById).toHaveBeenCalledWith(STALE_FILE.id);
    expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
      "file_cleanup_purged_total",
      expect.any(String),
      1,
    );
  });

  it("bounds janitor scans to one batch per run", async () => {
    vi.mocked(mockFilesRepo.findPendingFilesBefore).mockResolvedValue([]);
    vi.mocked(mockFilesRepo.findUnlinkedBefore).mockResolvedValue([]);

    await worker.cleanupOrphanPendingFiles();

    expect(mockFilesRepo.findPendingFilesBefore).toHaveBeenCalledWith(expect.any(Date), true, 100);
    expect(mockFilesRepo.findUnlinkedBefore).toHaveBeenCalledWith(expect.any(Date), true, 100);
  });

  it("purges confirmed but never-linked files older than the unlinked cutoff", async () => {
    const unlinked = { ...STALE_FILE, id: "file-unlinked-1", status: "uploaded" as const };
    vi.mocked(mockFilesRepo.findPendingFilesBefore).mockResolvedValue([]);
    vi.mocked(mockFilesRepo.findUnlinkedBefore).mockResolvedValue([unlinked]);

    const result = await worker.cleanupOrphanPendingFiles();

    expect(result.purgedCount).toBe(1);
    expect(mockStorage.delete).toHaveBeenCalledWith(unlinked.key);
    expect(mockFilesRepo.deleteById).toHaveBeenCalledWith(unlinked.id);
  });

  it("handles storage deletion errors gracefully without throwing", async () => {
    vi.mocked(mockStorage.delete).mockRejectedValueOnce(new Error("S3 timeout"));

    const result = await worker.cleanupOrphanPendingFiles();

    expect(result.purgedCount).toBe(0);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
