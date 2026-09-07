import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import { ListNoteAttachmentsQuery } from "./list-note-attachments.query";
import { GetNoteByIdQuery } from "./get-note-by-id.query";
import { ListFilesByParentQuery } from "../../../files/application/queries/list-files-by-parent.query";
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

const PAGE = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

describe("ListNoteAttachmentsQuery", () => {
  let query: ListNoteAttachmentsQuery;
  let getNoteById: GetNoteByIdQuery;
  let listFiles: ListFilesByParentQuery;

  beforeEach(() => {
    getNoteById = { execute: vi.fn() } as unknown as GetNoteByIdQuery;
    listFiles = {
      executeForVerifiedParent: vi.fn(),
    } as unknown as ListFilesByParentQuery;
    query = new ListNoteAttachmentsQuery(getNoteById, listFiles);
  });

  it("should list attachments after verifying note access", async () => {
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(NOTE));
    vi.mocked(listFiles.executeForVerifiedParent).mockResolvedValue(ok(PAGE as never));

    const result = await query.execute("note-1", ACTOR);

    expect(result.isOk()).toBe(true);
    expect(getNoteById.execute).toHaveBeenCalledWith("note-1", ACTOR);
    expect(listFiles.executeForVerifiedParent).toHaveBeenCalledWith("note", "note-1", 1, 20, undefined);
  });

  it("should deny listing without note access and never touch files", async () => {
    vi.mocked(getNoteById.execute).mockResolvedValue(err({ type: "NOTE_NOT_FOUND", noteId: "x" }));

    const result = await query.execute("x", ACTOR);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.type).toBe("NOTE_NOT_FOUND");
    expect(listFiles.executeForVerifiedParent).not.toHaveBeenCalled();
  });
});
