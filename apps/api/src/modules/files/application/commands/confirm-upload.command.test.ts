import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfirmUploadCommand } from "./confirm-upload.command";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import { ok, err } from "neverthrow";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import type { AuthorizationService } from "../../../../infrastructure/authorization";
import type { TenantContextService } from "../../../../infrastructure/database";

const ACTOR = { sub: "user-1", email: "user@example.com", role: "user" } as const;

describe("ConfirmUploadCommand", () => {
  let command: ConfirmUploadCommand;
  let filesRepo: FilesRepository;
  let storage: StorageService;
  let authorization: AuthorizationService;
  let tenantContext: TenantContextService;

  beforeEach(() => {
    filesRepo = {
      findByKey: vi.fn(),
      markUploadReady: vi.fn(),
    } as unknown as FilesRepository;
    storage = {
      getMetadata: vi.fn().mockResolvedValue(ok({ size: 1024, contentType: "application/pdf" })),
    } as unknown as StorageService;
    authorization = {
      check: vi.fn().mockReturnValue({ allowed: true, reason: "REBAC_RELATION" }),
    } as unknown as AuthorizationService;
    tenantContext = {
      get: vi.fn().mockReturnValue({ mode: "single" }),
    } as unknown as TenantContextService;

    command = new ConfirmUploadCommand(filesRepo, storage, undefined, authorization, tenantContext);
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
    vi.mocked(filesRepo.markUploadReady).mockResolvedValue(null);

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
    expect(filesRepo.markUploadReady).not.toHaveBeenCalled();
  });

  it("reports storage failure separately from invalid uploaded metadata", async () => {
    const file = createFile();
    vi.mocked(filesRepo.findByKey).mockResolvedValue(file);
    vi.mocked(storage.getMetadata).mockResolvedValue(
      err({ code: "NOT_FOUND", message: "api.error.notFound" }),
    );

    const result = await command.execute(file.key, ACTOR);

    expect(result.isErr() && result.error.type).toBe("STORAGE_UNAVAILABLE");
    expect(filesRepo.markUploadReady).not.toHaveBeenCalled();
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
    vi.mocked(filesRepo.markUploadReady).mockResolvedValue(updatedFile);

    const result = await command.execute(file.key, ACTOR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.status).toBe("uploading");
    }
    expect(filesRepo.markUploadReady).toHaveBeenCalledWith(
      file.id,
      expect.objectContaining({ size: 1024, contentType: "application/pdf" }),
    );
  });

  it("validates the quarantine object, never the final key (H09)", async () => {
    const file = createFile();
    vi.mocked(filesRepo.findByKey).mockResolvedValue(file);
    vi.mocked(filesRepo.markUploadReady).mockResolvedValue({ ...file, status: "uploading" });

    const result = await command.execute(file.key, ACTOR);

    expect(result.isOk()).toBe(true);
    expect(storage.getMetadata).toHaveBeenCalledWith(`${file.key}.quarantine`);
  });

  it("returns the existing processing record on repeat confirmation", async () => {
    const file: FileEntity = { ...createFile(), status: "scanning" };
    vi.mocked(filesRepo.findByKey).mockResolvedValue(file);

    const result = await command.execute(file.key, ACTOR);

    expect(result.isOk()).toBe(true);
    expect(storage.getMetadata).not.toHaveBeenCalled();
    expect(filesRepo.markUploadReady).not.toHaveBeenCalled();
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
