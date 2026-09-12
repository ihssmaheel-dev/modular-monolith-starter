import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../../../infrastructure/database";
import { TenantContextService } from "../../../../infrastructure/database";
import { BaseRepository } from "../../../../infrastructure/database";
import { notes, type NoteRow } from "../schemas/note.schema";
import { Note } from "../../domain/entities/note.entity";

@Injectable()
export class NotesRepository extends BaseRepository<Note, NoteRow> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(notes, database, tenantContext, true);
  }

  protected toDomain(row: NoteRow): Note {
    return Note.fromPersistence({
      id: row.id,
      title: row.title,
      content: row.content,
      createdBy: row.createdBy ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tenantId: row.tenantId ?? undefined,
    });
  }
}
