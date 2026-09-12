export interface FileRecord {
  id: string;
  tenantId?: string;
  key: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  bucket: string;
  parentId?: string;
  parentType: "note" | "user" | "general";
  slot?: string | null;
  uploadedBy: string;
  status: "pending" | "uploading" | "scanning" | "uploaded" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

export type FileErrorType =
  | { type: "FILE_NOT_FOUND"; message: string }
  | { type: "PRESIGN_FAILED"; message: string }
  | { type: "UPLOAD_FAILED"; message: string }
  | { type: "METADATA_MISMATCH"; message: string }
  | { type: "UPLOAD_IN_PROGRESS"; message: string }
  | { type: "PROXY_TRANSFER_UNAVAILABLE"; message: string }
  | { type: "DELETE_FAILED"; message: string }
  | { type: "INVALID_FILE_TYPE"; message: string }
  | { type: "FILE_TOO_LARGE"; message: string }
  | { type: "QUOTA_EXCEEDED"; message: string }
  | { type: "UNAUTHORIZED"; message: string };
