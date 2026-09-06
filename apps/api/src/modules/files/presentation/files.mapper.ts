import { env } from "../../../config/env";
import { FileEntity } from "../domain/entities/file.entity";
import type { FileMetadataResponse } from "@repo/contracts";

export function toFileResponse(file: FileEntity): FileMetadataResponse {
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
