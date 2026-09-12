import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { TransactionError } from "../../../../infrastructure/database";
import type { NoteNotFound } from "../../domain/errors/note.errors";
import { NotesRepository } from "../../infrastructure/repositories/notes.repository";

const PURGE_BATCH_LIMIT = 500;

/**
 * GDPR erasure fan-out: hard-delete every note created by a subject in the
 * current tenant context. Per-note domain events are intentionally skipped —
 * the erasure itself is the audited event, and titles must not fan out to the
 * outbox. Reads and deletes in bounded batches with no long-lived
 * transaction, so large libraries cannot exhaust memory or hit
 * idle-in-transaction timeouts. Idempotent: safe to retry.
 */
@Injectable()
export class PurgeUserNotesCommand {
  constructor(private readonly repository: NotesRepository) {}

  async execute(
    userId: string,
  ): Promise<Result<{ deleted: number }, NoteNotFound | TransactionError>> {
    let deleted = 0;
    for (;;) {
      const page = await this.repository.paginate(
        { createdBy: userId },
        { page: 1, limit: PURGE_BATCH_LIMIT },
      );
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
