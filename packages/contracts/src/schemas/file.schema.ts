import { z } from "zod";

export const FileIdParamSchema = z.object({ id: z.string() });

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
] as const;

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const RequestUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_MIME_TYPES),
  fileSize: z.number().positive().max(MAX_FILE_SIZE_BYTES),
});

export const AttachFileSchema = z.object({
  fileId: z.string().min(1).max(1024),
  slot: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "api.error.invalidRequest")
    .optional(),
});

export const ConfirmUploadSchema = z.object({
  fileKey: z
    .string()
    .min(1)
    .max(1024)
    .refine((value) => !value.includes("..") && !value.startsWith("/"), {
      message: "api.error.invalidRequest",
    }),
});

export const FileMetadataSchema = z.object({
  id: z.string(),
  key: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  fileSize: z.number(),
  bucket: z.string(),
  url: z.string(),
  parentId: z.string().optional(),
  parentType: z.string(),
  slot: z.string().max(64).nullable(),
  uploadedBy: z.string(),
  status: z.enum(["pending", "uploading", "scanning", "uploaded", "failed"]),
  createdAt: z.string().datetime(),
});

export const PresignedUrlResponseSchema = z.object({
  uploadMode: z.enum(["direct", "proxy"]),
  uploadUrl: z.string().url(),
  fileKey: z.string(),
  expiresAt: z.string().datetime().optional(),
});

export const DownloadUrlResponseSchema = z.object({
  downloadUrl: z.string().url(),
});

export const FileListResponseSchema = z.object({
  items: z.array(FileMetadataSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().positive(),
});

export type RequestUploadInput = z.infer<typeof RequestUploadSchema>;
export type AttachFileInput = z.infer<typeof AttachFileSchema>;
export type ConfirmUploadInput = z.infer<typeof ConfirmUploadSchema>;
export type FileMetadataResponse = z.infer<typeof FileMetadataSchema>;
export type PresignedUrlResponse = z.infer<typeof PresignedUrlResponseSchema>;
export type DownloadUrlResponse = z.infer<typeof DownloadUrlResponseSchema>;
export type FileListResponse = z.infer<typeof FileListResponseSchema>;
