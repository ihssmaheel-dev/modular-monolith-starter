import { describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import { FileScannerService } from "./file-scanner.service";
import type { StorageService } from "../storage.service";
import type { PinoLoggerService } from "../../logger/logger.service";

const FILE = { key: "uploads/file", fileSize: 4, contentType: "text/plain" };

describe("FileScannerService", () => {
  it("distinguishes a missing object from a storage outage", async () => {
    const logger = { error: vi.fn() } as unknown as PinoLoggerService;
    const storage = { getMetadata: vi.fn() } as unknown as StorageService;
    const scanner = new FileScannerService(storage, logger);

    vi.mocked(storage.getMetadata).mockResolvedValueOnce(ok(null));
    await expect(scanner.scan(FILE)).resolves.toEqual({ error: "OBJECT_MISSING" });

    vi.mocked(storage.getMetadata).mockResolvedValueOnce(
      err({ code: "NOT_FOUND", message: "api.error.notFound" }),
    );
    await expect(scanner.scan(FILE)).resolves.toEqual({ error: "SCANNER_UNAVAILABLE" });
  });
});
