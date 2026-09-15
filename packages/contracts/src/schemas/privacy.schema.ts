import { z } from "zod";
import { PaginationQuerySchema } from "./pagination.schema";

export const DsrTypeSchema = z.enum(["EXPORT", "ACCOUNT_ERASURE", "ORGANIZATION_ERASURE"]);
export const DsrStatusSchema = z.enum([
  "REQUESTED",
  "PROCESSING",
  "READY",
  "PARTIAL",
  "FULFILLED",
  "EXPIRED",
  "FAILED",
]);

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

export const ExportedInvitationSchema = z.object({
  organizationId: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
});

export const ExportDownloadResponseSchema = z.object({
  exportedAt: z.string().datetime(),
  profile: ExportedProfileSchema,
  memberships: z.array(ExportedMembershipSchema),
  invitations: z.array(ExportedInvitationSchema),
  modules: z.record(z.string(), z.unknown()),
  truncated: z.boolean(),
});

export const PrivacyListQuerySchema = PaginationQuerySchema;

export type DsrType = z.infer<typeof DsrTypeSchema>;
export type DsrStatus = z.infer<typeof DsrStatusSchema>;
export type RequestAccountErasureInput = z.infer<typeof RequestAccountErasureSchema>;
export type RequestOrganizationErasureInput = z.infer<typeof RequestOrganizationErasureSchema>;
export type DsrResponse = z.infer<typeof DsrResponseSchema>;
export type DsrListResponse = z.infer<typeof DsrListResponseSchema>;
export type ExportDownloadResponse = z.infer<typeof ExportDownloadResponseSchema>;
