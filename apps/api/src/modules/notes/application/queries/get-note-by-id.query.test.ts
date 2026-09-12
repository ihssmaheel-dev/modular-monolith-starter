import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetNoteByIdQuery } from "./get-note-by-id.query";
import { NotesRepository } from "../../infrastructure/repositories/notes.repository";
import { Note } from "../../domain/entities/note.entity";
import { ok } from "neverthrow";

const ACTOR = { sub: "admin-1", email: "admin@example.com", role: "admin" } as const;

describe("GetNoteByIdQuery", () => {
  let query: GetNoteByIdQuery;
  let repository: NotesRepository;

  beforeEach(() => {
    repository = {
      findById: vi.fn(),
    } as unknown as NotesRepository;

    query = new GetNoteByIdQuery(repository);
  });

  it("should return NOTE_NOT_FOUND if repository returns null", async () => {
    // Arrange
    vi.mocked(repository.findById).mockResolvedValue(ok(null));

    // Act
    const result = await query.execute("123", ACTOR);

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "NOTE_NOT_FOUND", noteId: "123" });
    }
  });

  it("should return ok with note if found", async () => {
    // Arrange
    const note = Note.fromPersistence({
      id: "123",
      title: "My Title",
      content: "Content",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(repository.findById).mockResolvedValue(ok(note));

    // Act
    const result = await query.execute("123", ACTOR);

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(note);
    }
  });
});
