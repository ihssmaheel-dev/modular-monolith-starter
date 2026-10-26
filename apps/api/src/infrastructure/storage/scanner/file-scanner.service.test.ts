import { afterEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "neverthrow";
import { Readable } from "node:stream";
import { FileScannerService } from "./file-scanner.service";
import type { StorageService } from "../storage.service";
import type { PinoLoggerService } from "../../logger/logger.service";

const FILE = { key: "uploads/file", fileSize: 4, contentType: "text/plain" };

describe("FileScannerService", () => {
  afterEach(() => vi.useRealTimers());
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

  it("binds the sampled bytes to the verified object metadata", async () => {
    const { scanner, storage } = fixture(Readable.from(Buffer.from("text")));

    await scanner.scan(FILE);

    expect(storage.getDownloadStream).toHaveBeenCalledWith(FILE.key, {
      etag: '"sample-etag"',
      versionId: "sample-version",
      range: "bytes=0-4095",
    });
  });

  it("releases a stalled stream and returns a retryable failure within the header deadline", async () => {
    vi.useFakeTimers();
    const stream = new Readable({ read() {} });
    const { scanner } = fixture(stream);
    const result = scanner.scan(FILE);

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toEqual({ error: "SCANNER_UNAVAILABLE" });
    expect(stream.destroyed).toBe(true);
    expect(stream.listenerCount("data")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats a premature close as retryable and removes its listeners", async () => {
    const stream = new Readable({
      read() {
        this.destroy();
      },
    });
    const { scanner } = fixture(stream);

    await expect(scanner.scan(FILE)).resolves.toEqual({ error: "SCANNER_UNAVAILABLE" });
    expect(stream.listenerCount("error")).toBe(0);
    expect(stream.listenerCount("close")).toBe(0);
  });

  it("treats body transport errors as retryable instead of leaving the scan lease stuck", async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error("connection reset"));
      },
    });
    const { scanner } = fixture(stream);

    await expect(scanner.scan(FILE)).resolves.toEqual({ error: "SCANNER_UNAVAILABLE" });
    expect(stream.destroyed).toBe(true);
  });
});

function fixture(stream: Readable) {
  const logger = { error: vi.fn(), warn: vi.fn() } as unknown as PinoLoggerService;
  const storage = {
    getMetadata: vi.fn().mockResolvedValue(
      ok({
        size: FILE.fileSize,
        contentType: FILE.contentType,
        etag: '"sample-etag"',
        versionId: "sample-version",
      }),
    ),
    getDownloadStream: vi.fn().mockResolvedValue(ok(stream)),
  } as unknown as StorageService;
  return { scanner: new FileScannerService(storage, logger), storage };
}
