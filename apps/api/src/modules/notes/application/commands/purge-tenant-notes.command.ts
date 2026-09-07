import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { TransactionError } from "../../../../infrastructure/database";
import type { NoteNotFound } from "../../domain/errors/note.errors";
import { NotesRepository } from "../../infrastructure/notes.repository";

const PURGE_BATCH_LIMIT = 500;

/**
 * GDPR tenant erasure fan-out: hard-delete every note in the current tenant
 * context. Per-note domain events are skipped (see PurgeUserNotesCommand).
 * Bounded batches with no long-lived transaction. Idempotent.
 */
@Injectable()
export class PurgeTenantNotesCommand {
  constructor(private readonly repository: NotesRepository) {}

  async execute(): Promise<Result<{ deleted: number }, NoteNotFound | TransactionError>> {
    let deleted = 0;
    for (;;) {
      const page = await this.repository.paginate({}, { page: 1, limit: PURGE_BATCH_LIMIT });
      if (page.isErr() || page.value.items.length === 0) break;
      for (const note of page.value.items) {
        const result = await this.repository.deleteById(note.id);
        if (result.isOk() && result.value) deleted += 1;
      }
      if (page.value.items.length < PURGE_BATCH_LIMIT) break;
    }
    return ok({ deleted });
  }
}
