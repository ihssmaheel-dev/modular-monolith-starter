import type { TenantRole } from "@repo/contracts";
import type { Invitation, Membership, Organization } from "../../domain/entities/tenancy.entity";

export function toOrganizationResponse(organization: Organization, role: TenantRole) {
  return {
    id: organization.data.id,
    name: organization.data.name,
    slug: organization.data.slug,
    role,
    createdAt: organization.data.createdAt.toISOString(),
    updatedAt: organization.data.updatedAt.toISOString(),
  };
}

export function toMemberResponse(membership: Membership) {
  return {
    id: membership.data.id,
    tenantId: membership.data.tenantId,
    userId: membership.data.userId,
    email: membership.data.userEmail,
    name: membership.data.userName,
    role: membership.data.role,
    joinedAt: membership.data.createdAt.toISOString(),
  };
}

export function toInvitationResponse(invitation: Invitation) {
  return {
    id: invitation.data.id,
    email: invitation.data.email,
    role: invitation.data.role,
    status: invitation.data.status,
    expiresAt: invitation.data.expiresAt.toISOString(),
    createdAt: invitation.data.createdAt.toISOString(),
  };
}
