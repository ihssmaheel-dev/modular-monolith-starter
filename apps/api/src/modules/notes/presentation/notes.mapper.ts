import { NoteListResponseDto, NoteResponseDto } from "@repo/contracts";
import { Note } from "../domain/entities/note.entity";
import type { PaginatedResult } from "../../../infrastructure/database";

export function toNoteResponse(note: Note): NoteResponseDto {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export function toNoteListResponse(page: PaginatedResult<Note>): NoteListResponseDto {
  return {
    items: page.items.map(toNoteResponse),
    total: page.total,
    page: page.page,
    limit: page.limit,
    totalPages: page.totalPages,
  };
}
