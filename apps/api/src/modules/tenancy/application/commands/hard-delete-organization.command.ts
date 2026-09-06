import { Injectable, Optional } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { OrganizationsRepository } from "../../infrastructure/organizations.repository";

/** Final step of organization erasure after the grace period. Idempotent. */
@Injectable()
export class HardDeleteOrganizationCommand {
  constructor(
    private readonly organizations: OrganizationsRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(tenantId: string): Promise<Result<void, TenancyError>> {
    const operation = async (): Promise<Result<void, TenancyError>> => {
      await this.organizations.deleteById(tenantId);
      return ok(undefined);
    };
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "TENANCY_OPERATION_FAILED" } : error,
    );
  }
}
