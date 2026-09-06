import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  type FileMetadataResponse,
} from "@repo/contracts";
import { createFilesClient } from "./files";

export type UploadBody = Blob | Uint8Array | ArrayBuffer;

export interface UploadSource {
  fileName: string;
  contentType: string;
  fileSize: number;
  /** Raw bytes (web). Native clients may omit this and read from a URI inside putBytes. */
  body?: UploadBody;
}

export type PutBytes = (
  url: string,
  body: UploadBody | undefined,
  contentType: string,
) => Promise<void>;

type FilesClient = ReturnType<typeof createFilesClient>;

function clientErrorKey(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "i18nKey" in error) {
    const key = (error as { i18nKey?: unknown }).i18nKey;
    if (typeof key === "string" && key.length > 0) return key;
  }
  return fallback;
}

export function validateUploadSource(source: UploadSource): void {
  const allowed = (ALLOWED_MIME_TYPES as readonly string[]).includes(source.contentType);
  if (!allowed || source.fileName.length === 0) throw new Error("api.error.invalidRequest");
  if (source.fileSize <= 0 || source.fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error("api.error.fileTooLarge");
  }
}

/**
 * Reusable direct-to-S3 upload: request presigned URL → PUT bytes → confirm.
 * Uploads are parent-agnostic; the owning module links the file afterwards
 * (e.g. notes.attach). Throws Error carrying an i18n key for mutations.
 */
export async function uploadFile(
  client: Pick<FilesClient, "requestUpload" | "confirmUpload">,
  source: UploadSource,
  putBytes: PutBytes,
): Promise<FileMetadataResponse> {
  validateUploadSource(source);

  const requested = await client.requestUpload({
    body: {
      fileName: source.fileName,
      contentType: source.contentType as (typeof ALLOWED_MIME_TYPES)[number],
      fileSize: source.fileSize,
    },
  });
  if (requested.status !== 201 || !requested.body) {
    throw new Error(clientErrorKey(requested.error, "api.error.uploadFailed"));
  }

  try {
    await putBytes(requested.body.uploadUrl, source.body, source.contentType);
  } catch {
    throw new Error("api.error.uploadFailed");
  }

  const confirmed = await client.confirmUpload({ body: { fileKey: requested.body.fileKey } });
  if (confirmed.status !== 200 || !confirmed.body) {
    throw new Error(clientErrorKey(confirmed.error, "api.error.uploadFailed"));
  }
  return confirmed.body;
}

export type UploadFileFn = typeof uploadFile;
