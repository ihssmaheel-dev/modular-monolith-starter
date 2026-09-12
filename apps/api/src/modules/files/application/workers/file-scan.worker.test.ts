import { describe, expect, it, vi, beforeEach } from "vitest";
import { err, ok } from "neverthrow";
import { FileScanWorker } from "./file-scan.worker";
import type { FilesRepository } from "../../infrastructure/repositories/files.repository";
import type { FileScannerService } from "../../../../infrastructure/storage/file-scanner.service";
import type { StorageService } from "../../../../infrastructure/storage/storage.service";
import type { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";

describe("FileScanWorker", () => {
  let files: FilesRepository;
  let scanner: FileScannerService;
  let storage: StorageService;
  let database: DatabaseService;
  let tenant: TenantContextService;
  let logger: PinoLoggerService;

  beforeEach(() => {
    vi.clearAllMocks();
    files = {
      claimUploadingFiles: vi
        .fn()
        .mockResolvedValue([
          { id: "file-1", key: "general/user-1/abc.pdf", fileSize: 10, contentType: "text/plain" },
        ]),
      updateById: vi.fn().mockResolvedValue(ok({})),
    } as unknown as FilesRepository;
    scanner = {
      scan: vi.fn().mockResolvedValue({ result: "clean" }),
    } as unknown as FileScannerService;
    storage = {
      copy: vi.fn().mockResolvedValue(ok(undefined)),
      delete: vi.fn().mockResolvedValue(ok(undefined)),
      getMetadata: vi.fn().mockResolvedValue(ok({ size: 10, contentType: "text/plain" })),
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
  });

  function worker() {
    return new FileScanWorker(files, scanner, storage, database, tenant, logger);
  }

  it("promotes clean bytes by copying quarantine to the final key (H09)", async () => {
    await worker().scanQuarantinedFiles();

    // Scanned at the quarantine key, promoted by server-side copy, served key verified.
    expect(scanner.scan).toHaveBeenCalledWith(
      expect.objectContaining({ key: "general/user-1/abc.pdf.quarantine" }),
    );
    expect(storage.copy).toHaveBeenCalledWith(
      "general/user-1/abc.pdf.quarantine",
      "general/user-1/abc.pdf",
    );
    expect(files.updateById).toHaveBeenCalledWith("file-1", { status: "uploaded" });
    expect(storage.delete).toHaveBeenCalledWith("general/user-1/abc.pdf.quarantine");
  });

  it("quarantines objects that fail antivirus or integrity checks", async () => {
    vi.mocked(scanner.scan).mockResolvedValue({ result: "infected" });

    await worker().scanQuarantinedFiles();

    expect(files.updateById).toHaveBeenCalledWith("file-1", { status: "failed" });
    expect(storage.copy).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith("general/user-1/abc.pdf.quarantine");
  });

  it("leaves the record unpromoted when the copy fails", async () => {
    vi.mocked(storage.copy).mockResolvedValue(
      err({ code: "COPY_FAILED", message: "api.error.uploadFailed" }),
    );

    await worker().scanQuarantinedFiles();

    expect(files.updateById).not.toHaveBeenCalled();
  });
});
