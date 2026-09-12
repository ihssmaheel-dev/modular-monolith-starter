import { Injectable, Optional } from "@nestjs/common";
import { err, Result } from "neverthrow";
import type { AuthenticatedUser, FileRecord as FileEntity } from "@repo/contracts";
import { ListFilesByParentQuery } from "../../../files/application/queries/list-files-by-parent.query";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import type { PaginatedResult } from "../../../../infrastructure/database";
import type { NoteNotFound } from "../../domain/errors/note.errors";
import { GetNoteByIdQuery } from "./get-note-by-id.query";

/**
 * Parent-owned attachment listing: the note is authorized first with the
 * notes module's own query, then files are listed without uploader scoping.
 * Never list attachments through the generic files endpoint — it is
 * self-scoped by design and cannot verify parent access.
 */
@Injectable()
export class ListNoteAttachmentsQuery {
  constructor(
    private readonly getNoteById: GetNoteByIdQuery,
    private readonly listFiles: ListFilesByParentQuery,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    noteId: string,
    actor: AuthenticatedUser,
    page = 1,
    limit = 20,
    slot?: string,
  ): Promise<Result<PaginatedResult<FileEntity>, NoteNotFound | TransactionError>> {
    const operation = async (): Promise<Result<PaginatedResult<FileEntity>, NoteNotFound>> => {
      const note = await this.getNoteById.execute(noteId, actor);
      if (note.isErr() || !note.value) return err({ type: "NOTE_NOT_FOUND", noteId });
      return this.listFiles.executeForVerifiedParent("note", noteId, page, limit, slot);
    };
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }
}
