import { Injectable, Optional } from "@nestjs/common";
import { ok, err, Result } from "neverthrow";
import { Note } from "../../domain/entities/note.entity";
import { NoteNotFound } from "../../domain/errors/note.errors";
import { NotesRepository } from "../../infrastructure/repositories/notes.repository";
import type { AuthenticatedUser } from "@repo/contracts";
import { AuthorizationService } from "../../../../infrastructure/authorization";
import { TenantContextService } from "../../../../infrastructure/database";
import { canAccessResource } from "../../../../common/utils/resource-authorization";

@Injectable()
export class GetNoteByIdQuery {
  constructor(
    private readonly repository: NotesRepository,
    @Optional() private readonly authorization?: AuthorizationService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {}

  async execute(id: string, actor: AuthenticatedUser): Promise<Result<Note, NoteNotFound>> {
    const result = await this.repository.findById(id);
    if (result.isErr()) return err(result.error);
    if (!result.value) return err({ type: "NOTE_NOT_FOUND", noteId: id });
    if (
      !canAccessResource(
        this.authorization,
        this.tenantContext,
        actor,
        "notes:read",
        "note",
        result.value,
      )
    ) {
      return err({ type: "NOTE_NOT_FOUND", noteId: id });
    }
    return ok(result.value);
  }
}
