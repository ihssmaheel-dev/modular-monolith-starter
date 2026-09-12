import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ok, err, Result } from "neverthrow";
import { z } from "zod";
import { UpdateNoteSchema } from "@repo/contracts";
import { Note } from "../../domain/entities/note.entity";
import { NoteNotFound } from "../../domain/errors/note.errors";
import { NoteUpdatedEvent } from "../../domain/events/note.events";
import { NotesRepository } from "../../infrastructure/repositories/notes.repository";
import { GetNoteByIdQuery } from "../queries/get-note-by-id.query";
import type { AuthenticatedUser } from "@repo/contracts";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class UpdateNoteCommand {
  constructor(
    private readonly repository: NotesRepository,
    private readonly getNoteById: GetNoteByIdQuery,
    private readonly eventEmitter: EventEmitter2,
    private readonly outbox: OutboxService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    id: string,
    data: z.infer<typeof UpdateNoteSchema>,
    actor: AuthenticatedUser,
  ): Promise<
    Result<Note, NoteNotFound | import("../../domain/errors/note.errors").NoteEventDispatchFailed>
  > {
    const operation = () => this.persist(id, data, actor);
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "NOTE_EVENT_DISPATCH_FAILED" } : error,
    );
  }

  private async persist(
    id: string,
    data: z.infer<typeof UpdateNoteSchema>,
    actor: AuthenticatedUser,
  ): Promise<
    Result<Note, NoteNotFound | import("../../domain/errors/note.errors").NoteEventDispatchFailed>
  > {
    const existing = await this.getNoteById.execute(id, actor);
    if (existing.isErr()) return err(existing.error);

    existing.value.update(data);
    const saved = await this.repository.updateById(existing.value.id, {
      title: existing.value.title,
      content: existing.value.content,
    });

    if (saved.isErr()) return err({ type: "NOTE_NOT_FOUND", noteId: id });
    if (!saved.value) return err({ type: "NOTE_NOT_FOUND", noteId: id });

    const event = new NoteUpdatedEvent(
      saved.value.id,
      saved.value.createdBy ?? actor.sub,
      data.title,
      data.content,
      saved.value.tenantId,
    );
    const dispatched = await this.outbox.dispatchTenant("note.updated", event);
    if (dispatched.isErr()) return err({ type: "NOTE_EVENT_DISPATCH_FAILED" });
    await this.emitMutated({
      collectionName: "notes",
      documentId: saved.value.id,
      action: "UPDATE",
      actorId: actor.sub,
      tenantId: saved.value.tenantId,
      before: { id: existing.value.id },
      after: { id: saved.value.id, title: saved.value.title },
    });

    return ok(saved.value);
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    if (this.database) {
      await this.database.emitAfterCommit(this.eventEmitter, "database.mutated", payload);
      return;
    }
    await this.eventEmitter.emitAsync("database.mutated", payload);
  }
}
