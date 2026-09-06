import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import { AttachFileToNoteCommand } from "./attach-file-to-note.command";
import { GetNoteByIdQuery } from "../queries/get-note-by-id.query";
import { LinkFileCommand } from "../../../files/application/commands/link-file.command";
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

  beforeEach(() => {
    getNoteById = { execute: vi.fn() } as unknown as GetNoteByIdQuery;
    linkFile = { execute: vi.fn() } as unknown as LinkFileCommand;
    command = new AttachFileToNoteCommand(getNoteById, linkFile);
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
});
