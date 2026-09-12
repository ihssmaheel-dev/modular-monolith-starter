import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { LinkFileCommand } from "./link-file.command";
import { FilesRepository } from "../../infrastructure/repositories/files.repository";
import type { FileEntity } from "../../domain/entities/file.entity";
import type { AuthenticatedUser } from "@repo/contracts";

const ACTOR = { sub: "user-1", email: "u@example.com", role: "user" } as AuthenticatedUser;

function file(overrides: Partial<FileEntity> = {}): FileEntity {
  return {
    id: "file-1",
    key: "general/user-1/a.pdf",
    fileName: "a.pdf",
    contentType: "application/pdf",
    fileSize: 100,
    bucket: "b",
    parentType: "general",
    uploadedBy: "user-1",
    status: "uploaded",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("LinkFileCommand", () => {
  let command: LinkFileCommand;
  let filesRepo: FilesRepository;

  beforeEach(() => {
    filesRepo = {
      findById: vi.fn(),
      updateById: vi.fn(),
    } as unknown as FilesRepository;
    command = new LinkFileCommand(filesRepo);
  });

  it("should link an own file to a parent", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(file()));
    vi.mocked(filesRepo.updateById).mockResolvedValue(ok(file({ parentType: "note" })));

    const result = await command.execute("file-1", { parentType: "note", parentId: "n1" }, ACTOR);

    expect(result.isOk()).toBe(true);
    expect(filesRepo.updateById).toHaveBeenCalledWith(
      "file-1",
      expect.objectContaining({ parentType: "note", parentId: "n1" }),
    );
  });

  it("should persist the slot when linking", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(file()));
    vi.mocked(filesRepo.updateById).mockResolvedValue(ok(file()));

    const result = await command.execute(
      "file-1",
      { parentType: "note", parentId: "n1", slot: "cover" },
      ACTOR,
    );

    expect(result.isOk()).toBe(true);
    expect(filesRepo.updateById).toHaveBeenCalledWith(
      "file-1",
      expect.objectContaining({ parentType: "note", parentId: "n1", slot: "cover" }),
    );
  });

  it("should return FILE_NOT_FOUND for a missing file", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(null));

    const result = await command.execute("missing", { parentType: "note", parentId: "n1" }, ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("FILE_NOT_FOUND");
    expect(filesRepo.updateById).not.toHaveBeenCalled();
  });

  it("should return UNAUTHORIZED for another user's file", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(file({ uploadedBy: "user-2" })));

    const result = await command.execute("file-1", { parentType: "note", parentId: "n1" }, ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("UNAUTHORIZED");
    expect(filesRepo.updateById).not.toHaveBeenCalled();
  });

  it("should refuse to link a failed upload", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(file({ status: "failed" })));

    const result = await command.execute("file-1", { parentType: "note", parentId: "n1" }, ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("UPLOAD_FAILED");
  });

  it("should refuse to link a file that is still being processed", async () => {
    vi.mocked(filesRepo.findById).mockResolvedValue(ok(file({ status: "scanning" })));

    const result = await command.execute("file-1", { parentType: "note", parentId: "n1" }, ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("UPLOAD_IN_PROGRESS");
    expect(filesRepo.updateById).not.toHaveBeenCalled();
  });
});
