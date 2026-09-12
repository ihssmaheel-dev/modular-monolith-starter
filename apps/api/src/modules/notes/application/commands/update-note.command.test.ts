import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdateNoteCommand } from "./update-note.command";
import { NotesRepository } from "../../infrastructure/repositories/notes.repository";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GetNoteByIdQuery } from "../queries/get-note-by-id.query";
import { Note } from "../../domain/entities/note.entity";
import { ok, err } from "neverthrow";
import type { OutboxService } from "../../../../infrastructure/outbox/outbox.service";

const ACTOR = { sub: "admin-1", email: "admin@example.com", role: "admin" } as const;

describe("UpdateNoteCommand", () => {
  let command: UpdateNoteCommand;
  let repository: NotesRepository;
  let getNoteById: GetNoteByIdQuery;
  let eventEmitter: EventEmitter2;
  let outbox: OutboxService;

  beforeEach(() => {
    repository = {
      updateById: vi.fn(),
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

    command = new UpdateNoteCommand(repository, getNoteById, eventEmitter, outbox);
  });

  it("should return err NOTE_NOT_FOUND if query returns err", async () => {
    // Arrange
    vi.mocked(getNoteById.execute).mockResolvedValue(
      err({ type: "NOTE_NOT_FOUND", noteId: "123" }),
    );

    // Act
    const result = await command.execute("123", { title: "New Title" }, ACTOR);

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "NOTE_NOT_FOUND", noteId: "123" });
    }
  });

  it("should update note and return ok", async () => {
    // Arrange
    const note = Note.fromPersistence({
      id: "123",
      title: "Old Title",
      content: "Old Content",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(note));
    vi.mocked(repository.updateById).mockResolvedValue(ok(note));

    // Act
    const result = await command.execute("123", { title: "New Title" }, ACTOR);

    // Assert
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.title).toBe("New Title");
    }
    expect(repository.updateById).toHaveBeenCalledWith("123", {
      title: "New Title",
      content: "Old Content",
    });
  });

  it("should return err if repository update fails", async () => {
    // Arrange
    const note = Note.fromPersistence({
      id: "123",
      title: "Old Title",
      content: "Old Content",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getNoteById.execute).mockResolvedValue(ok(note));
    vi.mocked(repository.updateById).mockResolvedValue(err({ type: "CONFLICT" }));

    // Act
    const result = await command.execute("123", { title: "New Title" }, ACTOR);

    // Assert
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ type: "NOTE_NOT_FOUND", noteId: "123" });
    }
  });
});
