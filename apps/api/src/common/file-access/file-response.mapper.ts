import { env } from "../../config/env";
import type { FileListResponse, FileMetadataResponse, FileRecord } from "@repo/contracts";
import type { PaginatedResult } from "../../infrastructure/database";

export function toFileResponse(file: FileRecord): FileMetadataResponse {
  const baseUrl =
    env.CDN_ENABLED && env.CDN_DOMAIN
      ? `https://${env.CDN_DOMAIN}/${env.CDN_BUCKET_PATH}`
      : storageBaseUrl(file.bucket);

  return {
    id: file.id,
    key: file.key,
    fileName: file.fileName,
    contentType: file.contentType,
    fileSize: file.fileSize,
    bucket: file.bucket,
    url: `${baseUrl}/${file.key}`,
    parentId: file.parentId,
    parentType: file.parentType,
    slot: file.slot ?? null,
    uploadedBy: file.uploadedBy,
    status: file.status,
    createdAt: file.createdAt.toISOString(),
  };
}

function storageBaseUrl(bucket: string): string {
  const endpoint = new URL(env.S3_ENDPOINT);
  if (env.S3_FORCE_PATH_STYLE) {
    return `${endpoint.toString().replace(/\/$/, "")}/${bucket}`;
  }
  return `${endpoint.protocol}//${bucket}.${endpoint.host}`;
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
