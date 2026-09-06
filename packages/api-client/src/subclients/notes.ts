import type {
  AttachFileInput,
  CreateNoteDto,
  FileMetadataResponse,
  NoteListResponseDto,
  NoteResponseDto,
  PaginationQuery,
  UpdateNoteDto,
} from "@repo/contracts";
import {
  EmptyResponseSchema,
  FileMetadataSchema,
  NoteListResponseSchema,
  NoteResponseSchema,
} from "@repo/contracts";
import type { FetchFn } from "../types";
import { orpcResponse, type OrpcClient } from "../orpc";
import { normalizePagination } from "../utils";

export function createNotesClient(fetchFn: FetchFn, orpc?: OrpcClient) {
  const client = {
    getNotes: (req: { query?: PaginationQuery } = {}) => {
      if (orpc) {
        return orpcResponse(
          () => orpc.notes.list(normalizePagination(req.query)),
          200,
          NoteListResponseSchema,
        );
      }
      const sp = new URLSearchParams();
      if (req.query?.page) sp.set("page", String(req.query.page));
      if (req.query?.limit) sp.set("limit", String(req.query.limit));
      const qs = sp.toString();
      return fetchFn<NoteListResponseDto>(
        `/notes${qs ? `?${qs}` : ""}`,
        {},
        NoteListResponseSchema,
      );
    },
    getNoteById: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(() => orpc.notes.getById({ id: req.params.id }), 200, NoteResponseSchema)
        : fetchFn<NoteResponseDto>(
            `/notes/${encodeURIComponent(req.params.id)}`,
            {},
            NoteResponseSchema,
          ),
    createNote: (req: { body: CreateNoteDto }) =>
      orpc
        ? orpcResponse(() => orpc.notes.create(req.body), 201, NoteResponseSchema)
        : fetchFn<NoteResponseDto>(
            "/notes",
            {
              method: "POST",
              body: JSON.stringify(req.body),
            },
            NoteResponseSchema,
          ),
    updateNote: (req: { params: { id: string }; body: UpdateNoteDto }) =>
      orpc
        ? orpcResponse(
            () => orpc.notes.update({ id: req.params.id, ...req.body }),
            200,
            NoteResponseSchema,
          )
        : fetchFn<NoteResponseDto>(
            `/notes/${encodeURIComponent(req.params.id)}`,
            {
              method: "PATCH",
              body: JSON.stringify(req.body),
            },
            NoteResponseSchema,
          ),
    deleteNote: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(() => orpc.notes.delete({ id: req.params.id }), 204, EmptyResponseSchema)
        : fetchFn<void>(`/notes/${encodeURIComponent(req.params.id)}`, { method: "DELETE" }),
  };

  const attachFile = (req: { params: { id: string }; body: AttachFileInput }) =>
    orpc
      ? orpcResponse(
          () => orpc.notes.attachFile({ id: req.params.id, ...req.body }),
          201,
          FileMetadataSchema,
        )
      : fetchFn<FileMetadataResponse>(
          `/notes/${encodeURIComponent(req.params.id)}/attachments`,
          {
            method: "POST",
            body: JSON.stringify(req.body),
          },
          FileMetadataSchema,
        );

  // Keep ergonomic aliases while preserving the explicit HTTP method names.
  return {
    ...client,
    attachFile,
    list: (input: { page?: number; limit?: number } = {}) =>
      client.getNotes({ query: { page: input.page ?? 1, limit: input.limit ?? 20 } }),
    get: (id: string) => client.getNoteById({ params: { id } }),
    create: client.createNote,
    update: (id: string, body: UpdateNoteDto) => client.updateNote({ params: { id }, body }),
    remove: (id: string) => client.deleteNote({ params: { id } }),
    attach: (id: string, fileId: string, slot?: string) =>
      attachFile({ params: { id }, body: slot ? { fileId, slot } : { fileId } }),
  };
}
