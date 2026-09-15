import { env } from "../../config/env";
import type { FileListResponse, FileMetadataResponse, FileRecord } from "@repo/contracts";
import type { PaginatedResult } from "../../infrastructure/database";

export function toFileResponse(file: FileRecord): FileMetadataResponse {
  return {
    id: file.id,
    key: file.key,
    fileName: file.fileName,
    contentType: file.contentType,
    fileSize: file.fileSize,
    bucket: file.bucket,
    url: authenticatedUrl(file.id),
    parentId: file.parentId,
    parentType: file.parentType,
    slot: file.slot ?? null,
    uploadedBy: file.uploadedBy,
    status: file.status,
    createdAt: file.createdAt.toISOString(),
  };
}

function authenticatedUrl(fileId: string): string {
  return new URL(`/api/v1/files/${fileId}/content`, env.API_URL).toString();
}

export function toFileListResponse(page: PaginatedResult<FileRecord>): FileListResponse {
  return {
    items: page.items.map(toFileResponse),
    total: page.total,
    page: page.page,
    limit: page.limit,
    totalPages: page.totalPages,
  };
}
