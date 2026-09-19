import { describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import { Readable } from "node:stream";
import { FileScannerService } from "./file-scanner.service";
import type { StorageService } from "../storage.service";
import type { PinoLoggerService } from "../../logger/logger.service";

const FILE = { key: "uploads/file", fileSize: 4, contentType: "text/plain" };

describe("FileScannerService", () => {
  it("distinguishes a missing object from a storage outage", async () => {
    const logger = { error: vi.fn() } as unknown as PinoLoggerService;
    const storage = {
      getMetadata: vi.fn(),
      getDownloadStream: vi.fn(),
    } as unknown as StorageService;
    const scanner = new FileScannerService(storage, logger);

    vi.mocked(storage.getMetadata).mockResolvedValueOnce(ok(null));
    await expect(scanner.scan(FILE)).resolves.toEqual({ error: "OBJECT_MISSING" });

    vi.mocked(storage.getMetadata).mockResolvedValueOnce(
      err({ code: "NOT_FOUND", message: "api.error.notFound" }),
    );
    await expect(scanner.scan(FILE)).resolves.toEqual({ error: "SCANNER_UNAVAILABLE" });
  });

  it("declares file infected when magic bytes do not match declared MIME type", async () => {
    const logger = { error: vi.fn(), warn: vi.fn() } as unknown as PinoLoggerService;
    const storage = {
      getMetadata: vi.fn(),
      getDownloadStream: vi.fn(),
    } as unknown as StorageService;
    const scanner = new FileScannerService(storage, logger);

    // PNG declared, but payload is text
    const pngFile = { key: "uploads/malicious.png", fileSize: 12, contentType: "image/png" };
    vi.mocked(storage.getMetadata).mockResolvedValueOnce(
      ok({ size: 12, contentType: "image/png" }),
    );
    vi.mocked(storage.getDownloadStream).mockResolvedValueOnce(
      ok(Readable.from(Buffer.from("not a png file"))),
    );

    const result = await scanner.scan(pngFile);
    expect(result).toEqual({ result: "infected" });
  });

  it("declares file clean when magic bytes match declared MIME type", async () => {
    const logger = { error: vi.fn(), warn: vi.fn() } as unknown as PinoLoggerService;
    const storage = {
      getMetadata: vi.fn(),
      getDownloadStream: vi.fn(),
    } as unknown as StorageService;
    const scanner = new FileScannerService(storage, logger);

    // Valid PNG header: 89 50 4E 47 0D 0A 1A 0A
    const validPngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    const pngFile = { key: "uploads/photo.png", fileSize: 10, contentType: "image/png" };
    vi.mocked(storage.getMetadata).mockResolvedValueOnce(
      ok({ size: 10, contentType: "image/png" }),
    );
    vi.mocked(storage.getDownloadStream).mockResolvedValueOnce(ok(Readable.from(validPngHeader)));

    const result = await scanner.scan(pngFile);
    expect(result).toEqual({ result: "clean" });
  });
});
