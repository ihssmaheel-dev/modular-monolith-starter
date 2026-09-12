import { Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ok, err, Result } from "neverthrow";
import { NoteNotFound } from "../../domain/errors/note.errors";
import { NoteDeletedEvent } from "../../domain/events/note.events";
import { NotesRepository } from "../../infrastructure/repositories/notes.repository";
import { GetNoteByIdQuery } from "../queries/get-note-by-id.query";
import type { AuthenticatedUser } from "@repo/contracts";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { DatabaseService } from "../../../../infrastructure/database";

@Injectable()
export class DeleteNoteCommand {
  constructor(
    private readonly repository: NotesRepository,
    private readonly getNoteById: GetNoteByIdQuery,
    private readonly eventEmitter: EventEmitter2,
    private readonly outbox: OutboxService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<
    Result<void, NoteNotFound | import("../../domain/errors/note.errors").NoteEventDispatchFailed>
  > {
    const operation = () => this.persist(id, actor);
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "NOTE_EVENT_DISPATCH_FAILED" } : error,
    );
  }

  private async persist(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<
    Result<void, NoteNotFound | import("../../domain/errors/note.errors").NoteEventDispatchFailed>
  > {
    const existing = await this.getNoteById.execute(id, actor);
    if (existing.isErr()) return err(existing.error);

    const deleted = await this.repository.deleteById(id);
    if (deleted.isErr()) return err({ type: "NOTE_NOT_FOUND", noteId: id });
    if (!deleted.value) return err({ type: "NOTE_NOT_FOUND", noteId: id });

    const event = new NoteDeletedEvent(
      id,
      existing.value.createdBy ?? actor.sub,
      existing.value.tenantId,
    );
    const dispatched = await this.outbox.dispatchTenant("note.deleted", event);
    if (dispatched.isErr()) return err({ type: "NOTE_EVENT_DISPATCH_FAILED" });
    await this.emitMutated({
      collectionName: "notes",
      documentId: id,
      action: "DELETE",
      actorId: actor.sub,
      tenantId: existing.value.tenantId,
      before: { id, title: existing.value.title },
      after: null,
    });

    return ok(undefined);
  }

  private async emitMutated(payload: Record<string, unknown>): Promise<void> {
    if (this.database) {
      await this.database.emitAfterCommit(this.eventEmitter, "database.mutated", payload);
      return;
    }
    await this.eventEmitter.emitAsync("database.mutated", payload);
  }
}
