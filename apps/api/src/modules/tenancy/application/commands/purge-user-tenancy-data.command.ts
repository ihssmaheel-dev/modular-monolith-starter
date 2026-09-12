import { Injectable, Optional } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import { DatabaseService } from "../../../../infrastructure/database";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";

/** GDPR erasure fan-out: remove every membership and invitation row for a subject. */
@Injectable()
export class PurgeUserTenancyDataCommand {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly invitations: InvitationsRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async execute(userId: string, email: string): Promise<Result<void, TenancyError>> {
    const operation = async (): Promise<Result<void, TenancyError>> => {
      await this.memberships.removeUser(userId);
      await this.invitations.deleteByEmail(email);
      return ok(undefined);
    };
    if (!this.database) return operation();
    const result = await this.database.withResultTransaction(operation);
    return result.mapErr((error) =>
      error.type === "TRANSACTION_FAILED" ? { type: "TENANCY_OPERATION_FAILED" } : error,
    );
  }
}
