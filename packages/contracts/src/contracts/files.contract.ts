import { oc } from "@orpc/contract";
import {
  RequestUploadSchema,
  ConfirmUploadSchema,
  FileMetadataSchema,
  PresignedUrlResponseSchema,
  FileListResponseSchema,
  DownloadUrlResponseSchema,
  FileIdParamSchema,
  FileListQuerySchema,
} from "../schemas/file.schema";
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
    .input(FileListQuerySchema)
    .output(FileListResponseSchema),
  delete: oc
    .route({ method: "DELETE", path: "/{id}", summary: "Delete a file", successStatus: 204 })
    .input(FileIdParamSchema)
    .output(EmptyResponseSchema),
});
