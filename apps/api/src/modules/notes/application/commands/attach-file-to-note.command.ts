import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import type { FileEntity } from "../../../files/domain/entities/file.entity";
import type { FileError } from "../../../files/domain/errors/file.errors";
import { LinkFileCommand } from "../../../files/application/commands/link-file.command";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import type { NoteNotFound } from "../../domain/errors/note.errors";
import { GetNoteByIdQuery } from "../queries/get-note-by-id.query";

/**
 * Reference attach flow for file uploads: the parent module verifies parent
 * ownership with its own queries, then delegates linking to the files module.
 * Copy this pattern for every new module that needs uploads — the files
 * module never changes.
 */
@Injectable()
export class AttachFileToNoteCommand {
  constructor(
    private readonly getNoteById: GetNoteByIdQuery,
    private readonly linkFile: LinkFileCommand,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(
    noteId: string,
    fileId: string,
    actor: AuthenticatedUser,
    slot?: string,
  ): Promise<Result<FileEntity, NoteNotFound | FileError | TransactionError>> {
    const operation = async (): Promise<
      Result<FileEntity, NoteNotFound | FileError | TransactionError>
    > => {
      const note = await this.getNoteById.execute(noteId, actor);
      if (note.isErr() || !note.value) return err({ type: "NOTE_NOT_FOUND", noteId });
      const linked = await this.linkFile.execute(
        fileId,
        { parentType: "note", parentId: noteId, slot },
        actor,
      );
      if (linked.isErr()) return err(linked.error);
      return ok(linked.value);
    };
    if (!this.database) return operation();
    return this.database.withResultTransaction(operation);
  }
}
