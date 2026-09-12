import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetFileDownloadUrlQuery } from "./get-file-download-url.query";
import { FileAccessRegistry } from "../../../../common/file-access/file-access.registry";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { FilesRepository } from "../../infrastructure/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import { ok, err } from "neverthrow";

const ACTOR = { sub: "user-1", email: "user@example.com", role: "user" } as const;

describe("GetFileDownloadUrlQuery", () => {
  let query: GetFileDownloadUrlQuery;
  let storage: StorageService;
  let filesRepo: FilesRepository;

  const mockFile: FileEntity = {
    id: "file-1",
    key: "note/note-1/user-1/abc-test.pdf",
    fileName: "test.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
    bucket: "uploads",
    parentId: "note-1",
    parentType: "note",
    uploadedBy: "user-1",
    status: "uploaded",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    storage = {
      getPresignedDownloadUrl: vi.fn(),
      usesDirectTransfer: vi.fn().mockReturnValue(true),
    } as unknown as StorageService;

    filesRepo = {
      findById: vi.fn(),
    } as unknown as FilesRepository;

    query = new GetFileDownloadUrlQuery(storage, filesRepo);
  });

  it("should return FILE_NOT_FOUND when file does not exist", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(null));

    const result = await query.execute("file-1", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("FILE_NOT_FOUND");
    }
  });

  it("should return PRESIGN_FAILED when presign fails", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(mockFile));
    vi.mocked(storage.getPresignedDownloadUrl).mockResolvedValue(
      err({ code: "PRESIGN_ERROR", message: "S3 unavailable" } as never),
    );

    const result = await query.execute("file-1", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("PRESIGN_FAILED");
    }
  });

  it("should return download URL on success", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(mockFile));
    vi.mocked(storage.getPresignedDownloadUrl).mockResolvedValue(
      ok("https://s3.example.com/download"),
    );

    const result = await query.execute("file-1", ACTOR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.downloadUrl).toBe("https://s3.example.com/download");
    }
    expect(storage.getPresignedDownloadUrl).toHaveBeenCalledWith(mockFile.key);
  });

  it("asks the owning domain for linked attachments when a registry is present (H10)", async () => {
    const checker = vi.fn().mockResolvedValue(true);
    const registry = {
      getChecker: vi.fn().mockReturnValue(checker),
    } as unknown as FileAccessRegistry;
    const scoped = new GetFileDownloadUrlQuery(
      storage,
      filesRepo,
      undefined,
      undefined,
      undefined,
      registry as never,
    );
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(mockFile));
    vi.mocked(storage.getPresignedDownloadUrl).mockResolvedValue(
      ok("https://s3.example.com/download"),
    );

    const result = await scoped.execute("file-1", ACTOR);

    expect(result.isOk()).toBe(true);
    expect(registry.getChecker).toHaveBeenCalledWith("note");
    expect(checker).toHaveBeenCalledWith(mockFile, ACTOR);
  });

  it("denies linked attachments the parent domain rejects (H10)", async () => {
    const registry = {
      getChecker: vi.fn().mockReturnValue(async () => false),
    } as unknown as FileAccessRegistry;
    const scoped = new GetFileDownloadUrlQuery(
      storage,
      filesRepo,
      undefined,
      undefined,
      undefined,
      registry as never,
    );
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(mockFile));

    const result = await scoped.execute("file-1", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("FILE_NOT_FOUND");
    }
    expect(storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("denies parent types without a registered checker (H10)", async () => {
    const registry = {
      getChecker: vi.fn().mockReturnValue(undefined),
    } as unknown as FileAccessRegistry;
    const scoped = new GetFileDownloadUrlQuery(
      storage,
      filesRepo,
      undefined,
      undefined,
      undefined,
      registry as never,
    );
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(mockFile));

    const result = await scoped.execute("file-1", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("FILE_NOT_FOUND");
    }
  });
});
