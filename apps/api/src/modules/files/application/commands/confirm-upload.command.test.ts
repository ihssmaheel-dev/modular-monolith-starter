import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfirmUploadCommand } from "./confirm-upload.command";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import { ok, err } from "neverthrow";
import { StorageService } from "../../../../infrastructure/storage/storage.service";

const ACTOR = { sub: "user-1", email: "user@example.com", role: "user" } as const;

describe("ConfirmUploadCommand", () => {
  let command: ConfirmUploadCommand;
  let filesRepo: FilesRepository;
  let storage: StorageService;

  beforeEach(() => {
    filesRepo = {
      findByKey: vi.fn(),
      updateById: vi.fn(),
    } as unknown as FilesRepository;
    storage = {
      getMetadata: vi.fn().mockResolvedValue(ok({ size: 1024, contentType: "application/pdf" })),
    } as unknown as StorageService;

    command = new ConfirmUploadCommand(filesRepo, storage);
  });

  it("should return FILE_NOT_FOUND when file does not exist", async () => {
    vi.mocked(filesRepo.findByKey).mockResolvedValue(null);

    const result = await command.execute("nonexistent-key", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("FILE_NOT_FOUND");
    }
  });

  it("should return UPLOAD_FAILED when update fails", async () => {
    const file: FileEntity = {
      id: "file-1",
      key: "note/note-1/user-1/abc-test.pdf",
      fileName: "test.pdf",
      contentType: "application/pdf",
      fileSize: 1024,
      bucket: "uploads",
      parentId: "note-1",
      parentType: "note",
      uploadedBy: "user-1",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(filesRepo.findByKey).mockResolvedValue(file);
    vi.mocked(filesRepo.updateById).mockResolvedValue(err({ type: "CONFLICT" }));

    const result = await command.execute(file.key, ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("UPLOAD_FAILED");
    }
  });

  it("should reject confirmation with METADATA_MISMATCH when the object was not uploaded", async () => {
    const file = createFile();
    vi.mocked(filesRepo.findByKey).mockResolvedValue(file);
    vi.mocked(storage.getMetadata).mockResolvedValue(ok(null));

    const result = await command.execute(file.key, ACTOR);

    expect(result.isErr() && result.error.type).toBe("METADATA_MISMATCH");
    if (result.isErr()) {
      expect(result.error.message).toBe("api.file.metadataMismatch");
    }
    expect(filesRepo.updateById).not.toHaveBeenCalled();
  });

  it("should update status to uploaded on success", async () => {
    const file: FileEntity = {
      id: "file-1",
      key: "note/note-1/user-1/abc-test.pdf",
      fileName: "test.pdf",
      contentType: "application/pdf",
      fileSize: 1024,
      bucket: "uploads",
      parentId: "note-1",
      parentType: "note",
      uploadedBy: "user-1",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(filesRepo.findByKey).mockResolvedValue(file);

    const updatedFile: FileEntity = { ...file, status: "uploading" };
    vi.mocked(filesRepo.updateById).mockResolvedValue(ok(updatedFile));

    const result = await command.execute(file.key, ACTOR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe("uploading");
    }
    expect(filesRepo.updateById).toHaveBeenCalledWith(file.id, { status: "uploading" });
  });

  it("validates the quarantine object, never the final key (H09)", async () => {
    const file = createFile();
    vi.mocked(filesRepo.findByKey).mockResolvedValue(file);
    vi.mocked(filesRepo.updateById).mockResolvedValue(ok({ ...file, status: "uploading" }));

    const result = await command.execute(file.key, ACTOR);

    expect(result.isOk()).toBe(true);
    expect(storage.getMetadata).toHaveBeenCalledWith(`${file.key}.quarantine`);
  });
});

function createFile(): FileEntity {
  return {
    id: "file-1",
    key: "note/note-1/user-1/abc-test.pdf",
    fileName: "test.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
    bucket: "uploads",
    parentId: "note-1",
    parentType: "note",
    uploadedBy: "user-1",
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
