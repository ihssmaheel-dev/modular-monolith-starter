import { Injectable, Optional } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import type { NoteNotFound } from "../../domain/errors/note.errors";
import { NotesRepository } from "../../infrastructure/notes.repository";

/**
 * GDPR tenant erasure fan-out: hard-delete every note in the current tenant
 * context. Per-note events are skipped (see PurgeUserNotesCommand). Idempotent.
 */
@Injectable()
export class PurgeTenantNotesCommand {
  constructor(
    private readonly repository: NotesRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(): Promise<Result<{ deleted: number }, NoteNotFound | TransactionError>> {
    const operation = async (): Promise<Result<{ deleted: number }, NoteNotFound>> => {
      const found = await this.repository.find({});
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
