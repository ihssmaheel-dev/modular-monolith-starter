import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteNoteCommand } from "./delete-note.command";
import { NotesRepository } from "../../infrastructure/repositories/notes.repository";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GetNoteByIdQuery } from "../queries/get-note-by-id.query";
import { Note } from "../../domain/entities/note.entity";
import { ok, err } from "neverthrow";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";

const ACTOR = { sub: "admin-1", email: "admin@example.com", role: "admin" } as const;

describe("DeleteNoteCommand", () => {
  let command: DeleteNoteCommand;
  let repository: NotesRepository;
  let getNoteById: GetNoteByIdQuery;
  let eventEmitter: EventEmitter2;
  let outbox: OutboxService;

  beforeEach(() => {
    repository = {
      deleteById: vi.fn(),
    } as unknown as NotesRepository;

    getNoteById = {
      execute: vi.fn(),
    } as unknown as GetNoteByIdQuery;

    eventEmitter = {
      emit: vi.fn(),
      emitAsync: vi.fn().mockResolvedValue([]),
    } as unknown as EventEmitter2;
    outbox = {
      dispatchTenant: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as OutboxService;

    command = new DeleteNoteCommand(repository, getNoteById, eventEmitter, outbox);
  });

  it("should return err NOTE_NOT_FOUND if query returns err", async () => {
    // Arrange
    vi.mocked(getNoteById.execute).mockResolvedValue(
      err({ type: "NOTE_NOT_FOUND", noteId: "123" }),
    );

    // Act
    const result = await command.execute("123", ACTOR);

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "NOTE_NOT_FOUND", noteId: "123" });
    }
  });

  it("should delete note and return ok", async () => {
    // Arrange
    const note = Note.fromPersistence({
      id: "123",
      title: "Old Title",
      content: "Old Content",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(note));
    vi.mocked(repository.deleteById).mockResolvedValue(ok(true));

    // Act
    const result = await command.execute("123", ACTOR);

    // Assert
    expect(result.isOk()).toBe(true);
    expect(repository.deleteById).toHaveBeenCalledWith("123");
  });

  it("should return err if repository delete fails", async () => {
    // Arrange
    const note = Note.fromPersistence({
      id: "123",
      title: "Old Title",
      content: "Old Content",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(note));
    vi.mocked(repository.deleteById).mockResolvedValue(ok(false));

    // Act
    const result = await command.execute("123", ACTOR);

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "NOTE_NOT_FOUND", noteId: "123" });
    }
  });
});
