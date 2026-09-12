import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetFileByIdQuery } from "./get-file-by-id.query";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import { ok } from "neverthrow";

const ACTOR = { sub: "user-1", email: "user@example.com", role: "user" } as const;

describe("GetFileByIdQuery", () => {
  let query: GetFileByIdQuery;
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
    filesRepo = {
      findById: vi.fn(),
    } as unknown as FilesRepository;

    query = new GetFileByIdQuery(filesRepo);
  });

  it("should return FILE_NOT_FOUND when file does not exist", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(null));

    const result = await query.execute("file-1", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("FILE_NOT_FOUND");
    }
  });

  it("should return file on success", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(mockFile));

    const result = await query.execute("file-1", ACTOR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(mockFile);
    }
    expect(filesRepo.findById).toHaveBeenCalledWith("file-1");
  });
});
