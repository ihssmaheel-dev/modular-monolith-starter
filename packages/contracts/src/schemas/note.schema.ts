import { z } from "zod";
import { PaginationQuerySchema } from "./pagination.schema";

export const NoteIdParamSchema = z.object({ id: z.string() });

export const CreateNoteSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  content: z.string().min(1, "Content is required"),
});

export const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).optional(),
});

export const NoteResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const NoteListResponseSchema = z.object({
  items: z.array(NoteResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().positive(),
});

export const NoteAttachmentsQuerySchema = PaginationQuerySchema.extend({
  slot: z.string().max(64).optional(),
});

export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteDto = z.infer<typeof UpdateNoteSchema>;
export type NoteResponseDto = z.infer<typeof NoteResponseSchema>;
export type NoteResponse = NoteResponseDto;
export type NoteListResponseDto = z.infer<typeof NoteListResponseSchema>;
export type NoteListResponse = NoteListResponseDto;
export type NoteAttachmentsQuery = z.infer<typeof NoteAttachmentsQuerySchema>;
