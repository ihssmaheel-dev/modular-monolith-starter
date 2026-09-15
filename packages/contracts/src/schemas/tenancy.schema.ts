import { z } from "zod";
import { INVITABLE_TENANT_ROLES, TENANCY_MODES, TENANT_ROLES } from "../constants";
import { EmailInputSchema } from "./common.schema";

const PageFields = {
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().positive(),
};

// Tenant identifiers are generated with crypto.randomUUID() by the API.
export const TenantIdSchema = z.string().uuid();
export const TenantRoleSchema = z.enum(TENANT_ROLES);

export const MemberUserIdParamSchema = z.object({ userId: z.string() });
export const TenantHeaderSchema = z.object({ "x-tenant-id": TenantIdSchema });

export const CreateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

export const OrganizationResponseSchema = z.object({
  id: TenantIdSchema,
  name: z.string(),
  slug: z.string(),
  role: TenantRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const OrganizationListResponseSchema = z.object({
  items: z.array(OrganizationResponseSchema),
  ...PageFields,
});

export const TenantStatusResponseSchema = z.object({
  mode: z.enum(TENANCY_MODES),
  header: z.literal("x-tenant-id"),
});

export const MemberResponseSchema = z.object({
  id: z.string(),
  tenantId: TenantIdSchema,
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: TenantRoleSchema,
  joinedAt: z.string().datetime(),
});

export const MemberListResponseSchema = z.object({
  items: z.array(MemberResponseSchema),
  ...PageFields,
});

export const InviteMemberSchema = z.object({
  email: EmailInputSchema,
  role: z.enum(INVITABLE_TENANT_ROLES).default("member"),
});

export const UpdateMemberSchema = z.object({ role: TenantRoleSchema });

export const InvitationResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(INVITABLE_TENANT_ROLES),
  status: z.enum(["pending", "accepted", "revoked"]),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const InvitationListResponseSchema = z.object({
  items: z.array(InvitationResponseSchema),
  ...PageFields,
});

export const AcceptInvitationSchema = z.object({ token: z.string().min(32).max(256) });

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type OrganizationResponse = z.infer<typeof OrganizationResponseSchema>;
export type OrganizationListResponse = z.infer<typeof OrganizationListResponseSchema>;
export type TenantStatusResponse = z.infer<typeof TenantStatusResponseSchema>;
export type MemberResponse = z.infer<typeof MemberResponseSchema>;
export type MemberListResponse = z.infer<typeof MemberListResponseSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type InvitationResponse = z.infer<typeof InvitationResponseSchema>;
export type InvitationListResponse = z.infer<typeof InvitationListResponseSchema>;
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>;
