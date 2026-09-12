import { z } from "zod";
import { PaginationQuerySchema } from "./pagination.schema";
import { DigestCadenceSchema } from "./notification.schema";

export const DsrTypeSchema = z.enum(["EXPORT", "ACCOUNT_ERASURE", "ORGANIZATION_ERASURE"]);
export const DsrStatusSchema = z.enum(["REQUESTED", "READY", "FULFILLED", "EXPIRED", "FAILED"]);

export const RequestAccountErasureSchema = z.object({
  password: z.string().min(1).max(128),
});

export const RequestOrganizationErasureSchema = z.object({
  organizationId: z.string().min(1),
  confirmationName: z.string().min(1).max(100),
});

export const DsrIdParamSchema = z.object({
  id: z.string().min(1),
});

export const DsrResponseSchema = z.object({
  id: z.string(),
  type: DsrTypeSchema,
  status: DsrStatusSchema,
  tenantId: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DsrListResponseSchema = z.object({
  requests: z.array(DsrResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number().int().positive(),
});

export const ExportedProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ExportedMembershipSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  role: z.string(),
});

export const ExportedNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tenantId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ExportedInvitationSchema = z.object({
  organizationId: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
});

export const ExportedFileSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  fileSize: z.number(),
  tenantId: z.string().nullable(),
  slot: z.string().max(64).nullable(),
  createdAt: z.string().datetime(),
});

export const ExportedPreferenceSchema = z.object({
  category: z.string(),
  inApp: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
  digestCadence: DigestCadenceSchema,
});

export const ExportedNotificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  category: z.string(),
  titleKey: z.string(),
  titleParams: z.record(z.string(), z.unknown()).nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  tenantId: z.string().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const ExportedDeviceSchema = z.object({
  platform: z.string(),
  provider: z.string(),
  createdAt: z.string().datetime(),
});

export const ExportedBatchItemSchema = z.object({
  titleKey: z.string(),
  titleParams: z.record(z.string(), z.unknown()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const ExportedBatchSchema = z.object({
  type: z.string(),
  groupingKey: z.string(),
  status: z.string(),
  items: z.array(ExportedBatchItemSchema),
  windowEndsAt: z.string().datetime(),
});

export const ExportDownloadResponseSchema = z.object({
  exportedAt: z.string().datetime(),
  profile: ExportedProfileSchema,
  memberships: z.array(ExportedMembershipSchema),
  invitations: z.array(ExportedInvitationSchema),
  notes: z.array(ExportedNoteSchema),
  files: z.array(ExportedFileSchema),
  notificationPreferences: z.array(ExportedPreferenceSchema).default([]),
  notifications: z.array(ExportedNotificationSchema).default([]),
  notificationDevices: z.array(ExportedDeviceSchema).default([]),
  notificationBatches: z.array(ExportedBatchSchema).default([]),
  truncated: z.boolean(),
});

export const PrivacyListQuerySchema = PaginationQuerySchema;

export type DsrType = z.infer<typeof DsrTypeSchema>;
export type DsrStatus = z.infer<typeof DsrStatusSchema>;
export type RequestAccountErasureInput = z.infer<typeof RequestAccountErasureSchema>;
export type RequestOrganizationErasureInput = z.infer<typeof RequestOrganizationErasureSchema>;
export type DsrResponse = z.infer<typeof DsrResponseSchema>;
export type DsrListResponse = z.infer<typeof DsrListResponseSchema>;
export type ExportedNotification = z.infer<typeof ExportedNotificationSchema>;
export type ExportedDevice = z.infer<typeof ExportedDeviceSchema>;
export type ExportedBatch = z.infer<typeof ExportedBatchSchema>;
export type ExportDownloadResponse = z.infer<typeof ExportDownloadResponseSchema>;
