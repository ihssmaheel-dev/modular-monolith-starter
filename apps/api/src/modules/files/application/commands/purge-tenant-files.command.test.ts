import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import { PurgeTenantFilesCommand } from "./purge-tenant-files.command";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import type { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";

function page(ids: string[]) {
  return {
    items: ids.map((id) => ({ id, key: `k-${id}` })),
    total: ids.length,
    page: 1,
    limit: 500,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };
}

describe("PurgeTenantFilesCommand", () => {
  let command: PurgeTenantFilesCommand;
  let files: FilesRepository;
  let storage: StorageService;

  beforeEach(() => {
    files = {
      paginate: vi.fn(),
      deleteById: vi.fn(),
    } as unknown as FilesRepository;
    storage = { delete: vi.fn() } as unknown as StorageService;
    const logger = { error: vi.fn() } as unknown as PinoLoggerService;
    command = new PurgeTenantFilesCommand(files, storage, logger);
  });

  it("should delete S3 bytes before rows in bounded batches", async () => {
    vi.mocked(files.paginate).mockResolvedValue(ok(page(["f1", "f2"]) as never));
    vi.mocked(storage.delete).mockResolvedValue(ok(undefined));
    vi.mocked(files.deleteById).mockResolvedValue(ok(true));

    const result = await command.execute();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ deleted: 2 });
    // Both the quarantine and the final object go; S3 deletes are idempotent.
    expect(storage.delete).toHaveBeenNthCalledWith(1, "k-f1.quarantine");
    expect(storage.delete).toHaveBeenNthCalledWith(2, "k-f1");
    expect(files.deleteById).toHaveBeenNthCalledWith(1, "f1");
  });

  it("should keep completed batches and report storage failures", async () => {
    vi.mocked(files.paginate).mockResolvedValue(ok(page(["f1", "f2"]) as never));
    vi.mocked(storage.delete)
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce(err({ code: "DELETE_FAILED", message: "x" }));
    vi.mocked(files.deleteById).mockResolvedValue(ok(true));

    const result = await command.execute();

    expect(result.isErr()).toBe(true);
    expect(files.deleteById).toHaveBeenCalledTimes(1);
  });
});
