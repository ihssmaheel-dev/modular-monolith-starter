import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser, TenantRole } from "@repo/contracts";
import type { Organization } from "../../domain/entities/tenancy.entity";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { OrganizationsRepository } from "../../infrastructure/repositories/organizations.repository";

export interface OrganizationAccess {
  organization: Organization;
  role: TenantRole;
}

export interface OrganizationAccessPage {
  items: OrganizationAccess[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ListOrganizationsQuery {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly organizations: OrganizationsRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    page: number,
    limit: number,
  ): Promise<Result<OrganizationAccessPage, TenancyError>> {
    const membershipPage = await this.memberships.paginateForUser(actor.sub, { page, limit });
    if (membershipPage.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    const ids = membershipPage.value.items.map((item) => item.data.tenantId);
    const organizations = await this.organizations.findByIds(ids);
    if (organizations.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
    const byId = new Map(organizations.value.map((item) => [item.data.id, item]));
    const items = membershipPage.value.items.flatMap((membership) => {
      const organization = byId.get(membership.data.tenantId);
      return organization ? [{ organization, role: membership.data.role }] : [];
    });
    return ok({
      items,
      total: membershipPage.value.total,
      page: membershipPage.value.page,
      limit: membershipPage.value.limit,
      totalPages: membershipPage.value.totalPages,
    });
  }
}
