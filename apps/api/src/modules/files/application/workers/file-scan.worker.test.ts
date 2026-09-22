import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";

import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import type { MetricsService } from "../../../../infrastructure/metrics/metrics.service";
import type { FileScannerService } from "../../../../infrastructure/storage/scanner/file-scanner.service";
import type { StorageService } from "../../../../infrastructure/storage/storage.service";
import type { FileEntity } from "../../domain/entities/file.entity";
import type { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { FileScanWorker } from "./file-scan.worker";

const FILE: FileEntity = {
  id: "file-1",
  key: "general/user-1/abc.pdf",
  fileName: "abc.pdf",
  fileSize: 10,
  contentType: "text/plain",
  bucket: "uploads",
  parentType: "general",
  uploadedBy: "user-1",
  status: "scanning",
  scanClaimToken: "claim-1",
  scanAttempts: 1,
  scanSourceEtag: '"approved"',
  scanCandidateKeys: ["general/user-1/abc.pdf.candidate-old-claim"],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SOURCE = { size: 10, contentType: "text/plain", etag: '"approved"' };
const CANDIDATE_KEY = "general/user-1/abc.pdf.candidate-claim-1";

describe("FileScanWorker", () => {
  let files: FilesRepository;
  let scanner: FileScannerService;
  let storage: StorageService;
  let database: DatabaseService;
  let tenant: TenantContextService;
  let logger: PinoLoggerService;
  let metrics: MetricsService;

  beforeEach(() => {
    vi.clearAllMocks();
    files = {
      claimUploadingFiles: vi.fn().mockResolvedValue([FILE]),
      renewScanLease: vi.fn().mockResolvedValue(true),
      completeScan: vi.fn().mockResolvedValue(true),
      retryScan: vi.fn().mockResolvedValue(true),
      rejectScan: vi.fn().mockResolvedValue(true),
    } as unknown as FilesRepository;
    scanner = {
      scan: vi.fn().mockResolvedValue({ result: "clean" }),
    } as unknown as FileScannerService;
    storage = {
      copy: vi.fn().mockResolvedValue(ok(undefined)),
      delete: vi.fn().mockResolvedValue(ok(undefined)),
      getMetadata: vi.fn().mockResolvedValueOnce(ok(SOURCE)).mockResolvedValueOnce(ok(SOURCE)),
    } as unknown as StorageService;
    database = {
      runTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()),
    } as unknown as DatabaseService;
    tenant = {
      runSystem: vi.fn(async (_context, callback: () => Promise<void>) => callback()),
    } as unknown as TenantContextService;
    logger = {
      child: vi.fn().mockReturnThis(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as PinoLoggerService;
    metrics = {
      incrementCounter: vi.fn(),
      recordHistogram: vi.fn(),
    } as unknown as MetricsService;
  });

  function worker() {
    return new FileScanWorker(files, scanner, storage, database, tenant, metrics, logger);
  }

  it("promotes clean bytes to an immutable claim candidate", async () => {
    await worker().scanQuarantinedFiles();

    expect(storage.copy).toHaveBeenCalledWith(
      `${FILE.key}.quarantine`,
      CANDIDATE_KEY,
      expect.objectContaining({ etag: '"approved"' }),
    );
    expect(files.completeScan).toHaveBeenCalledWith(FILE.id, "claim-1", CANDIDATE_KEY);
    expect(storage.delete).toHaveBeenCalledWith(`${FILE.key}.quarantine`);
  });

  it("rejects infected content through the current claim token", async () => {
    vi.mocked(scanner.scan).mockResolvedValue({ result: "infected" });

    await worker().scanQuarantinedFiles();

    expect(files.rejectScan).toHaveBeenCalledWith(FILE.id, "claim-1", "CONTENT_REJECTED");
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it("keeps recoverable bytes and schedules retry when promotion fails", async () => {
    vi.mocked(storage.copy).mockResolvedValue(
      err({ code: "COPY_FAILED", message: "api.error.uploadFailed" }),
    );

    await worker().scanQuarantinedFiles();

    expect(files.retryScan).toHaveBeenCalledWith(
      FILE.id,
      "claim-1",
      "COPY_FAILED",
      expect.any(Date),
      5,
    );
    expect(storage.delete).not.toHaveBeenCalledWith(`${FILE.key}.quarantine`);
  });

  it("deletes only its candidate when a stale owner loses completion", async () => {
    vi.mocked(files.completeScan).mockResolvedValue(false);

    await worker().scanQuarantinedFiles();

    expect(storage.delete).toHaveBeenCalledWith(CANDIDATE_KEY);
    expect(storage.delete).not.toHaveBeenCalledWith(`${FILE.key}.quarantine`);
  });

  it("does not copy after lease ownership is lost", async () => {
    vi.mocked(files.renewScanLease).mockResolvedValue(false);

    await worker().scanQuarantinedFiles();

    expect(storage.copy).not.toHaveBeenCalled();
    expect(files.completeScan).not.toHaveBeenCalled();
  });
});
