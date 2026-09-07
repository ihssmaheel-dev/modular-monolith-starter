import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import { AttachFileToNoteCommand } from "./attach-file-to-note.command";
import { GetNoteByIdQuery } from "../queries/get-note-by-id.query";
import { LinkFileCommand } from "../../../files/application/commands/link-file.command";
import { ListFilesByParentQuery } from "../../../files/application/queries/list-files-by-parent.query";
import { DeleteFileCommand } from "../../../files/application/commands/delete-file.command";
import { Note } from "../../domain/entities/note.entity";
import type { AuthenticatedUser } from "@repo/contracts";

const ACTOR = { sub: "user-1", email: "u@example.com", role: "user" } as AuthenticatedUser;

const NOTE = Note.fromPersistence({
  id: "note-1",
  title: "T",
  content: "C",
  createdBy: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
});

const FILE = {
  id: "file-1",
  key: "general/user-1/a.pdf",
  fileName: "a.pdf",
  contentType: "application/pdf",
  fileSize: 100,
  bucket: "b",
  parentType: "note",
  parentId: "note-1",
  uploadedBy: "user-1",
  status: "uploading",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("AttachFileToNoteCommand", () => {
  let command: AttachFileToNoteCommand;
  let getNoteById: GetNoteByIdQuery;
  let linkFile: LinkFileCommand;
  let listFiles: ListFilesByParentQuery;
  let deleteFile: DeleteFileCommand;

  const emptyPage = {
    items: [],
    total: 0,
    page: 1,
    limit: 100,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };

  beforeEach(() => {
    getNoteById = { execute: vi.fn() } as unknown as GetNoteByIdQuery;
    linkFile = { execute: vi.fn() } as unknown as LinkFileCommand;
    listFiles = {
      execute: vi.fn(),
      executeForVerifiedParent: vi.fn(),
    } as unknown as ListFilesByParentQuery;
    deleteFile = { execute: vi.fn() } as unknown as DeleteFileCommand;
    command = new AttachFileToNoteCommand(getNoteById, linkFile, listFiles, deleteFile);
  });

  it("should verify the note then link the file", async () => {
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(NOTE));
    vi.mocked(linkFile.execute).mockResolvedValue(ok(FILE as never));

    const result = await command.execute("note-1", "file-1", ACTOR);

    expect(result.isOk()).toBe(true);
    expect(getNoteById.execute).toHaveBeenCalledWith("note-1", ACTOR);
    expect(linkFile.execute).toHaveBeenCalledWith(
      "file-1",
      { parentType: "note", parentId: "note-1" },
      ACTOR,
    );
  });

  it("should return NOTE_NOT_FOUND without touching files", async () => {
    vi.mocked(getNoteById.execute).mockResolvedValue(err({ type: "NOTE_NOT_FOUND", noteId: "x" }));

    const result = await command.execute("x", "file-1", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("NOTE_NOT_FOUND");
    expect(linkFile.execute).not.toHaveBeenCalled();
  });

  it("should propagate link failures", async () => {
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(NOTE));
    vi.mocked(linkFile.execute).mockResolvedValue(
      err({ type: "UNAUTHORIZED", message: "api.error.unauthorized" }),
    );

    const result = await command.execute("note-1", "file-1", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("UNAUTHORIZED");
  });

  it("should not touch sibling files for unslotted attachments", async () => {
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(NOTE));
    vi.mocked(linkFile.execute).mockResolvedValue(ok(FILE as never));

    const result = await command.execute("note-1", "file-1", ACTOR);

    expect(result.isOk()).toBe(true);
    expect(listFiles.executeForVerifiedParent).not.toHaveBeenCalled();
    expect(deleteFile.execute).not.toHaveBeenCalled();
  });

  it("should replace the previous file when attaching with the same slot", async () => {
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(NOTE));
    vi.mocked(listFiles.executeForVerifiedParent).mockResolvedValue(
      ok({ ...emptyPage, items: [FILE] }) as never,
    );
    vi.mocked(deleteFile.execute).mockResolvedValue(ok(undefined));
    vi.mocked(linkFile.execute).mockResolvedValue(ok(FILE as never));

    const result = await command.execute("note-1", "file-2", ACTOR, "cover");

    expect(result.isOk()).toBe(true);
    expect(listFiles.executeForVerifiedParent).toHaveBeenCalledWith("note", "note-1", 1, 100, "cover");
    expect(deleteFile.execute).toHaveBeenCalledWith("file-1", ACTOR);
    expect(linkFile.execute).toHaveBeenCalledWith(
      "file-2",
      { parentType: "note", parentId: "note-1", slot: "cover" },
      ACTOR,
    );
  });

  it("should fail the attach when the previous slotted file cannot be removed", async () => {
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(NOTE));
    vi.mocked(listFiles.executeForVerifiedParent).mockResolvedValue(
      ok({ ...emptyPage, items: [FILE] }) as never,
    );
    vi.mocked(deleteFile.execute).mockResolvedValue(
      err({ type: "UNAUTHORIZED", message: "api.error.unauthorized" }),
    );

    const result = await command.execute("note-1", "file-2", ACTOR, "cover");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("UNAUTHORIZED");
    expect(linkFile.execute).not.toHaveBeenCalled();
  });
});
