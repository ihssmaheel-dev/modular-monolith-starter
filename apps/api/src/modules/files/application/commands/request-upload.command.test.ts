import { describe, it, expect, vi, beforeEach } from "vitest";
import { RequestUploadCommand } from "./request-upload.command";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { FilesRepository } from "../../infrastructure/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import { ok, err } from "neverthrow";
import type { TenantContextService } from "../../../../infrastructure/database";
import type { AuthenticatedUser } from "@repo/contracts";

vi.mock("../../../../config/env", () => ({
  env: { S3_BUCKET: "test-bucket", API_URL: "http://localhost:3001" },
}));

const ACTOR = { sub: "user-1", email: "u@example.com", role: "user" } as AuthenticatedUser;

describe("RequestUploadCommand", () => {
  let command: RequestUploadCommand;
  let storage: StorageService;
  let filesRepo: FilesRepository;

  beforeEach(() => {
    storage = {
      getPresignedUploadUrl: vi.fn(),
      usesDirectTransfer: vi.fn().mockReturnValue(true),
    } as unknown as StorageService;

    filesRepo = {
      create: vi.fn().mockResolvedValue(ok(defaultFile())),
    } as unknown as FilesRepository;

    const tenantContext = {
      get: vi.fn().mockReturnValue({ mode: "single" }),
    } as unknown as TenantContextService;
    command = new RequestUploadCommand(storage, filesRepo, tenantContext);
  });

  it("should return PRESIGN_FAILED when presign fails", async () => {
    vi.mocked(storage.getPresignedUploadUrl).mockResolvedValue(
      err({ code: "PRESIGN_ERROR", message: "S3 unavailable" } as never),
    );

    const result = await command.execute(
      {
        fileName: "test.pdf",
        contentType: "application/pdf",
        fileSize: 1024,
      },
      ACTOR,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("PRESIGN_FAILED");
    }
  });

  it("should return UPLOAD_FAILED when repo create fails", async () => {
    vi.mocked(storage.getPresignedUploadUrl).mockResolvedValue(ok("https://s3.example.com/upload"));
    vi.mocked(filesRepo.create).mockResolvedValue(err({ code: "DB_ERROR" } as never));

    const result = await command.execute(
      {
        fileName: "test.pdf",
        contentType: "application/pdf",
        fileSize: 1024,
      },
      ACTOR,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("UPLOAD_FAILED");
    }
  });

  it("should return QUOTA_EXCEEDED when the user quota is exhausted", async () => {
    const tenantContext = {
      get: vi.fn().mockReturnValue({ mode: "single" }),
    } as unknown as TenantContextService;
    const overQuotaRepo = {
      create: vi.fn(),
      sumActiveBytes: vi.fn().mockResolvedValue(Number.MAX_SAFE_INTEGER),
    } as unknown as FilesRepository;
    const guarded = new RequestUploadCommand(storage, overQuotaRepo, tenantContext);

    const result = await guarded.execute(
      {
        fileName: "big.pdf",
        contentType: "application/pdf",
        fileSize: 1024,
      },
      ACTOR,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("QUOTA_EXCEEDED");
    }
    expect(overQuotaRepo.create).not.toHaveBeenCalled();
  });

  it("should return upload URL on success with a user-scoped key", async () => {
    vi.mocked(storage.getPresignedUploadUrl).mockResolvedValue(ok("https://s3.example.com/upload"));

    const file: FileEntity = {
      id: "file-1",
      key: "general/user-1/abc-test.pdf",
      fileName: "test.pdf",
      contentType: "application/pdf",
      fileSize: 1024,
      bucket: "test-bucket",
      parentType: "general",
      uploadedBy: "user-1",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(filesRepo.create).mockResolvedValue(ok(file));

    const result = await command.execute(
      {
        fileName: "test.pdf",
        contentType: "application/pdf",
        fileSize: 1024,
      },
      ACTOR,
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.uploadUrl).toBe("https://s3.example.com/upload");
      expect(result.value.fileKey).toMatch(/^general\/user-1\//);
      expect(result.value.expiresAt).toBeDefined();
      expect(Number.isNaN(Date.parse(result.value.expiresAt ?? ""))).toBe(false);
    }
    expect(filesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentType: "general", uploadedBy: "user-1" }),
    );
  });

  it("should sanitize file name in key", async () => {
    vi.mocked(storage.getPresignedUploadUrl).mockResolvedValue(ok("https://s3.example.com/upload"));

    const file: FileEntity = {
      id: "file-3",
      key: "general/user-1/abc-my_file.pdf",
      fileName: "my file.pdf",
      contentType: "application/pdf",
      fileSize: 500,
      bucket: "test-bucket",
      parentType: "general",
      uploadedBy: "user-1",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(filesRepo.create).mockResolvedValue(ok(file));

    const result = await command.execute(
      {
        fileName: "my file.pdf",
        contentType: "application/pdf",
        fileSize: 500,
      },
      ACTOR,
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fileKey).not.toContain(" ");
    }
  });
});

function defaultFile(): FileEntity {
  return {
    id: "file-default",
    key: "general/user-1/default-file.txt",
    fileName: "test.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
    bucket: "test-bucket",
    parentType: "general",
    uploadedBy: "user-1",
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
