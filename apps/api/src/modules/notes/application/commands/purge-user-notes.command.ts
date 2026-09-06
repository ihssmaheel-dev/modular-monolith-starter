import { Injectable, Optional } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import type { NoteNotFound } from "../../domain/errors/note.errors";
import { NotesRepository } from "../../infrastructure/notes.repository";

/**
 * GDPR erasure fan-out: hard-delete every note created by a subject in the
 * current tenant context. Per-note domain events are intentionally skipped —
 * the erasure itself is the audited event, and titles must not fan out to the
 * outbox. Idempotent: safe to retry.
 */
@Injectable()
export class PurgeUserNotesCommand {
  constructor(
    private readonly repository: NotesRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    userId: string,
  ): Promise<Result<{ deleted: number }, NoteNotFound | TransactionError>> {
    const operation = async (): Promise<Result<{ deleted: number }, NoteNotFound>> => {
      const found = await this.repository.find({ createdBy: userId });
      if (found.isErr()) return ok({ deleted: 0 });
      let deleted = 0;
      for (const note of found.value) {
        const result = await this.repository.deleteById(note.id);
        if (result.isOk() && result.value) deleted += 1;
      }
      return ok({ deleted });
    };
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }
}
