export type FileError =
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
