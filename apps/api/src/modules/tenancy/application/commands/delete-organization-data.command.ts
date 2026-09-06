import { Injectable, Optional } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { InvitationsRepository } from "../../infrastructure/invitations.repository";
import { MembershipsRepository } from "../../infrastructure/memberships.repository";
import { OrganizationsRepository } from "../../infrastructure/organizations.repository";

/**
 * GDPR tenant erasure: scrub memberships + invitations now, soft-delete the
 * organization shell (hard-deleted by the privacy purge worker after grace).
 */
@Injectable()
export class DeleteOrganizationDataCommand {
  constructor(
    private readonly organizations: OrganizationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly invitations: InvitationsRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(tenantId: string): Promise<Result<void, TenancyError>> {
    const operation = async (): Promise<Result<void, TenancyError>> => {
      await this.memberships.deleteByTenant(tenantId);
      await this.invitations.deleteByTenant(tenantId);
      await this.organizations.softDeleteById(tenantId);
      return ok(undefined);
    };
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "TENANCY_OPERATION_FAILED" } : error,
    );
  }
}
