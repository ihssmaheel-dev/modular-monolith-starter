import type {
  ConfirmUploadInput,
  DownloadUrlResponse,
  FileListResponse,
  FileMetadataResponse,
  PresignedUrlResponse,
  RequestUploadInput,
} from "@repo/contracts";
import {
  DownloadUrlResponseSchema,
  EmptyResponseSchema,
  FileListResponseSchema,
  FileMetadataSchema,
  PresignedUrlResponseSchema,
} from "@repo/contracts";
import type { FetchFn } from "../types";
import { orpcResponse, type OrpcClient } from "../orpc";
import { normalizePagination } from "../utils";

type FileListQuery = {
  page?: number;
  limit?: number;
  parentId?: string;
  parentType?: "note" | "user" | "general";
  slot?: string;
};

export function createFilesClient(fetchFn: FetchFn, orpc?: OrpcClient) {
  return {
    requestUpload: (req: { body: RequestUploadInput }) =>
      orpc
        ? orpcResponse(() => orpc.files.requestUpload(req.body), 201, PresignedUrlResponseSchema)
        : fetchFn<PresignedUrlResponse>(
            "/files/upload-url",
            {
              method: "POST",
              body: JSON.stringify(req.body),
            },
            PresignedUrlResponseSchema,
          ),
    confirmUpload: (req: { body: ConfirmUploadInput }) =>
      orpc
        ? orpcResponse(() => orpc.files.confirmUpload(req.body), 200, FileMetadataSchema)
        : fetchFn<FileMetadataResponse>(
            "/files/confirm",
            {
              method: "POST",
              body: JSON.stringify(req.body),
            },
            FileMetadataSchema,
          ),
    getDownloadUrl: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(
            () => orpc.files.getDownloadUrl({ id: req.params.id }),
            200,
            DownloadUrlResponseSchema,
          )
        : fetchFn<DownloadUrlResponse>(
            `/files/${encodeURIComponent(req.params.id)}/download-url`,
            {},
            DownloadUrlResponseSchema,
          ),
    getById: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(() => orpc.files.getById({ id: req.params.id }), 200, FileMetadataSchema)
        : fetchFn<FileMetadataResponse>(
            `/files/${encodeURIComponent(req.params.id)}`,
            {},
            FileMetadataSchema,
          ),
    listByParent: (req: { query?: FileListQuery } = {}) => {
      const parentType = req.query?.parentType;
      if (orpc && parentType) {
        return orpcResponse(
          () =>
            orpc.files.listByParent({
              ...normalizePagination(req.query),
              parentId: req.query?.parentId,
              parentType,
              ...(req.query?.slot ? { slot: req.query.slot } : {}),
            }),
          200,
          FileListResponseSchema,
        );
      }
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query ?? {})) {
        if (v !== undefined) sp.set(k, String(v));
      }
      const qs = sp.toString();
      return fetchFn<FileListResponse>(`/files${qs ? `?${qs}` : ""}`, {}, FileListResponseSchema);
    },
    delete: (req: { params: { id: string } }) =>
      orpc
        ? orpcResponse(() => orpc.files.delete({ id: req.params.id }), 204, EmptyResponseSchema)
        : fetchFn<void>(`/files/${encodeURIComponent(req.params.id)}`, { method: "DELETE" }),
  };
}
