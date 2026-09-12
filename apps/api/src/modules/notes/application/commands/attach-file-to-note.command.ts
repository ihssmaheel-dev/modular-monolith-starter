import { Injectable, Optional } from "@nestjs/common";
import { err, ok, Result } from "neverthrow";
import type {
  AuthenticatedUser,
  FileErrorType as FileError,
  FileRecord as FileEntity,
} from "@repo/contracts";
import { DeleteFileCommand } from "../../../files/application/commands/delete-file.command";
import { LinkFileCommand } from "../../../files/application/commands/link-file.command";
import { ListFilesByParentQuery } from "../../../files/application/queries/list-files-by-parent.query";
import { DatabaseService, type TransactionError } from "../../../../infrastructure/database";
import type { NoteNotFound } from "../../domain/errors/note.errors";
import { GetNoteByIdQuery } from "../queries/get-note-by-id.query";

const SLOT_LIST_LIMIT = 100;

/**
 * Reference attach flow for file uploads: the parent module verifies parent
 * ownership with its own queries, then delegates linking to the files module.
 * Copy this pattern for every new module that needs uploads — the files
 * module never changes.
 *
 * Slot rule (also copy this): unslotted attachments are unlimited, but a
 * slotted attachment point holds one file — attaching with the same slot
 * deletes the previous sibling first. Constrained modules (photo/aadhar)
 * add a per-slot allowlist (mime + max) on top; notes accept every
 * contract-allowed mime type, so no allowlist is needed here.
 */
@Injectable()
export class AttachFileToNoteCommand {
  constructor(
    private readonly getNoteById: GetNoteByIdQuery,
    private readonly linkFile: LinkFileCommand,
    private readonly listFiles: ListFilesByParentQuery,
    private readonly deleteFile: DeleteFileCommand,
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
      if (slot) {
        const replaced = await this.replaceSlot(noteId, slot, actor);
        if (replaced.isErr()) return err(replaced.error);
      }
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

  private async replaceSlot(
    noteId: string,
    slot: string,
    actor: AuthenticatedUser,
  ): Promise<Result<void, FileError | TransactionError>> {
    const existing = await this.listFiles.executeForVerifiedParent(
      "note",
      noteId,
      1,
      SLOT_LIST_LIMIT,
      slot,
    );
    if (existing.isErr()) {
      return err({ type: "UPLOAD_FAILED", message: "api.error.uploadFailed" });
    }
    for (const file of existing.value.items) {
      const removed = await this.deleteFile.execute(file.id, actor);
      if (removed.isErr()) return err(removed.error);
    }
    return ok(undefined);
  }
}
