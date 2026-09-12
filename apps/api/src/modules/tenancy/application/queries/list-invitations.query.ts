import { Injectable } from "@nestjs/common";
import { err, type Result } from "neverthrow";
import { TenantContextService, type PaginatedResult } from "../../../../infrastructure/database";
import type { Invitation } from "../../domain/entities/tenancy.entity";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository";

@Injectable()
export class ListInvitationsQuery {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly context: TenantContextService,
  ) {}

  execute(page: number, limit: number): Promise<Result<PaginatedResult<Invitation>, TenancyError>> {
    const tenantId = this.context.getRequiredTenantId();
    if (!tenantId) return Promise.resolve(err({ type: "TENANT_REQUIRED" }));
    return this.invitations.paginateForTenant(tenantId, { page, limit });
  }
}
