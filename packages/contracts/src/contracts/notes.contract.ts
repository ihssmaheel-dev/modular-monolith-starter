import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  CreateNoteSchema,
  NoteListResponseSchema,
  NoteResponseSchema,
  UpdateNoteSchema,
  NoteIdParamSchema,
} from "../schemas/note.schema";
import {
  AttachFileSchema,
  FileListResponseSchema,
  FileMetadataSchema,
} from "../schemas/file.schema";
import { PaginationQuerySchema } from "../schemas/pagination.schema";
import { EmptyResponseSchema } from "../schemas/common.schema";

export const notesContract = oc.prefix("/notes").router({
  list: oc
    .route({ method: "GET", path: "/", summary: "Get paginated notes" })
    .input(PaginationQuerySchema)
    .output(NoteListResponseSchema),
  getById: oc
    .route({ method: "GET", path: "/{id}", summary: "Get a note by ID" })
    .input(NoteIdParamSchema)
    .output(NoteResponseSchema),
  create: oc
    .route({ method: "POST", path: "/", summary: "Create a new note", successStatus: 201 })
    .input(CreateNoteSchema)
    .output(NoteResponseSchema),
  update: oc
    .route({ method: "PATCH", path: "/{id}", summary: "Update a note" })
    .input(NoteIdParamSchema.and(UpdateNoteSchema))
    .output(NoteResponseSchema),
  delete: oc
    .route({ method: "DELETE", path: "/{id}", summary: "Delete a note", successStatus: 204 })
    .input(NoteIdParamSchema)
    .output(EmptyResponseSchema),
  attachFile: oc
    .route({
      method: "POST",
      path: "/{id}/attachments",
      summary: "Attach an uploaded file to a note",
      successStatus: 201,
    })
    .input(NoteIdParamSchema.and(AttachFileSchema))
    .output(FileMetadataSchema),
  listAttachments: oc
    .route({ method: "GET", path: "/{id}/attachments", summary: "List a note's attachments" })
    .input(
      NoteIdParamSchema.and(PaginationQuerySchema).and(
        z.object({ slot: z.string().max(64).optional() }),
      ),
    )
    .output(FileListResponseSchema),
});
