import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteFileCommand } from "./delete-file.command";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import { ok } from "neverthrow";

const ACTOR = { sub: "user-1", email: "user@example.com", role: "user" } as const;
const OTHER_ACTOR = { ...ACTOR, sub: "other-user" };

describe("DeleteFileCommand", () => {
  let command: DeleteFileCommand;
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
      delete: vi.fn(),
    } as unknown as StorageService;

    filesRepo = {
      findById: vi.fn(),
      softDeleteById: vi.fn(),
    } as unknown as FilesRepository;

    command = new DeleteFileCommand(storage, filesRepo);
  });

  it("should return FILE_NOT_FOUND when file does not exist", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(null));

    const result = await command.execute("file-1", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("FILE_NOT_FOUND");
    }
  });

  it("should return UNAUTHORIZED when user is not the owner", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(mockFile));

    const result = await command.execute("file-1", OTHER_ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("UNAUTHORIZED");
    }
    expect(filesRepo.softDeleteById).not.toHaveBeenCalled();
  });

  it("should delete from storage and return ok on success", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(mockFile));
    vi.mocked(filesRepo.softDeleteById).mockResolvedValue(ok(mockFile));
    vi.mocked(storage.delete).mockResolvedValue(ok(undefined));

    const result = await command.execute("file-1", ACTOR);

    expect(result.isOk()).toBe(true);
    expect(filesRepo.softDeleteById).toHaveBeenCalledWith("file-1");
    expect(storage.delete).toHaveBeenCalledWith(mockFile.key);
  });
});
