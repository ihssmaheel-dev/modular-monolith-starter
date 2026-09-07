import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListFilesByParentQuery } from "./list-files-by-parent.query";
import { FilesRepository } from "../../infrastructure/files.repository";
import { FileEntity } from "../../domain/entities/file.entity";
import { ok } from "neverthrow";

const ACTOR = { sub: "user-1", email: "user@example.com", role: "user" } as const;

describe("ListFilesByParentQuery", () => {
  let query: ListFilesByParentQuery;
  let filesRepo: FilesRepository;

  const mockFiles: FileEntity[] = [
    {
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
    },
    {
      id: "file-2",
      key: "note/note-1/user-1/def-doc.pdf",
      fileName: "doc.pdf",
      contentType: "application/pdf",
      fileSize: 2048,
      bucket: "uploads",
      parentId: "note-1",
      parentType: "note",
      uploadedBy: "user-1",
      status: "uploaded",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    filesRepo = {
      paginate: vi.fn(),
    } as unknown as FilesRepository;

    query = new ListFilesByParentQuery(filesRepo);
  });

  it("should return files by parentId", async () => {
    vi.mocked(filesRepo.paginate).mockResolvedValue(
      ok({
        items: mockFiles,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }),
    );

    const result = await query.execute("note", ACTOR, "note-1");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual(mockFiles);
      expect(result.value.total).toBe(2);
    }
    expect(filesRepo.paginate).toHaveBeenCalledWith(
      { parentType: "note", parentId: "note-1", uploadedBy: ACTOR.sub },
      { page: 1, limit: 20, sort: { createdAt: -1 } },
    );
  });

  it("should return all files by parentType when parentId is absent", async () => {
    vi.mocked(filesRepo.paginate).mockResolvedValue(
      ok({
        items: mockFiles,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }),
    );

    const result = await query.execute("note", ACTOR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual(mockFiles);
      expect(result.value.total).toBe(2);
    }
    expect(filesRepo.paginate).toHaveBeenCalledWith(
      { parentType: "note", uploadedBy: ACTOR.sub },
      { page: 1, limit: 20, sort: { createdAt: -1 } },
    );
  });

  it("should return empty list when no files exist", async () => {
    vi.mocked(filesRepo.paginate).mockResolvedValue(
      ok({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }),
    );

    const result = await query.execute("note", ACTOR, "note-999");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual([]);
      expect(result.value.total).toBe(0);
    }
  });

  it("should not scope uploads for admins", async () => {
    vi.mocked(filesRepo.paginate).mockResolvedValue(
      ok({
        items: mockFiles,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }),
    );
    const admin = { sub: "admin-1", email: "admin@example.com", role: "admin" } as const;

    await query.execute("note", admin, "note-1");

    expect(filesRepo.paginate).toHaveBeenCalledWith(
      { parentType: "note", parentId: "note-1" },
      { page: 1, limit: 20, sort: { createdAt: -1 } },
    );
  });

  it("should list a verified parent without uploader scoping", async () => {
    vi.mocked(filesRepo.paginate).mockResolvedValue(
      ok({
        items: mockFiles,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }),
    );

    const result = await query.executeForVerifiedParent("note", "note-1", 1, 20, "cover");

    expect(result.isOk()).toBe(true);
    expect(filesRepo.paginate).toHaveBeenCalledWith(
      { parentType: "note", parentId: "note-1", slot: "cover" },
      { page: 1, limit: 20, sort: { createdAt: -1 } },
    );
  });
});
