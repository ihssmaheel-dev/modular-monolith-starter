import { oc } from "@orpc/contract";
import {
  RequestUploadSchema,
  ConfirmUploadSchema,
  FileMetadataSchema,
  PresignedUrlResponseSchema,
  FileListResponseSchema,
  DownloadUrlResponseSchema,
  FileIdParamSchema,
} from "../schemas/file.schema";
import { PaginationQuerySchema } from "../schemas/pagination.schema";
import { z } from "zod";
import { EmptyResponseSchema } from "../schemas/common.schema";

export const filesContract = oc.prefix("/files").router({
  requestUpload: oc
    .route({
      method: "POST",
      path: "/upload-url",
      summary: "Request a direct S3 presigned upload URL",
      successStatus: 201,
    })
    .input(RequestUploadSchema)
    .output(PresignedUrlResponseSchema),
  confirmUpload: oc
    .route({
      method: "POST",
      path: "/confirm",
      summary: "Confirm upload completed and persist metadata",
    })
    .input(ConfirmUploadSchema)
    .output(FileMetadataSchema),
  getDownloadUrl: oc
    .route({
      method: "GET",
      path: "/{id}/download-url",
      summary: "Get a direct S3 presigned download URL",
    })
    .input(FileIdParamSchema)
    .output(DownloadUrlResponseSchema),
  getById: oc
    .route({ method: "GET", path: "/{id}", summary: "Get file metadata by ID" })
    .input(FileIdParamSchema)
    .output(FileMetadataSchema),
  listByParent: oc
    .route({ method: "GET", path: "/", summary: "List files by parent entity" })
    .input(
      PaginationQuerySchema.extend({
        parentId: z.string().optional(),
        parentType: z.enum(["note", "user", "general"]),
        slot: z.string().max(64).optional(),
      }),
    )
    .output(FileListResponseSchema),
  delete: oc
    .route({ method: "DELETE", path: "/{id}", summary: "Delete a file", successStatus: 204 })
    .input(FileIdParamSchema)
    .output(EmptyResponseSchema),
});
