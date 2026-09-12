import { Readable } from "node:stream";

export const PRESIGN_TTL_SECONDS = 3600; // 1 hour

export interface StorageError {
  code:
    | "UPLOAD_FAILED"
    | "DELETE_FAILED"
    | "DOWNLOAD_FAILED"
    | "PRESIGN_FAILED"
    | "COPY_FAILED"
    | "NOT_FOUND"
    | "CIRCUIT_OPEN"
    | "BULKHEAD_REJECTED";
  message: string;
}

export interface UploadResult {
  key: string;
  url: string;
}

export interface StoredObjectMetadata {
  size: number;
  contentType?: string;
}

export type FileInput = Buffer | Readable | ReadableStream;

export interface StorageDriver {
  upload(key: string, body: FileInput, contentType: string): Promise<UploadResult>;
  getPresignedUploadUrl(key: string, contentType: string, ttlSeconds?: number): Promise<string>;
  getPresignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string>;
  getMetadata(key: string): Promise<StoredObjectMetadata | null>;
  getDownloadStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
}
