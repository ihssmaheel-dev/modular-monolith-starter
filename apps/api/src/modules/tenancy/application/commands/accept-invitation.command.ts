import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { DatabaseService } from "../../../../infrastructure/database";
import type { Membership } from "../../domain/entities/tenancy.entity";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";
import { hashInvitationToken } from "./invite-member.command";

@Injectable()
export class AcceptInvitationCommand {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly database: DatabaseService,
  ) {}

  async execute(
    token: string,
    actor: AuthenticatedUser,
  ): Promise<Result<Membership, TenancyError>> {
    const result = await this.database.withResultTransaction<Membership, TenancyError>(async () => {
      const invitation = await this.invitations.findByTokenHash(hashInvitationToken(token));
      if (invitation.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
      if (!invitation.value) return err({ type: "INVITATION_INVALID" });
      const invitationValue = invitation.value;
      if (invitationValue.data.email !== actor.email.toLowerCase()) {
        return err({ type: "INVITATION_EMAIL_MISMATCH" });
      }

      const tenantId = invitationValue.data.tenantId;
      await this.database.setTenantContext(tenantId);
      const existingMembership = await this.memberships.findMembership(tenantId, actor.sub);
      if (existingMembership.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
      if (existingMembership.value) return err({ type: "MEMBERSHIP_ALREADY_EXISTS" });

      const membership = await this.memberships.create({
        tenantId,
        userId: actor.sub,
        userEmail: actor.email.toLowerCase(),
        userName: actor.name ?? actor.email,
        role: invitationValue.data.role,
      });
      if (membership.isErr()) return err({ type: "TENANCY_OPERATION_FAILED" });
      const accepted = await this.invitations.markAccepted(invitationValue.data.id, actor.sub);
      if (accepted.isErr() || !accepted.value) {
        return err({ type: "INVITATION_INVALID" });
      }
      return ok(membership.value);
    });
    if (result.isErr()) {
      return result.error.type === "TRANSACTION_FAILED"
        ? err({ type: "TENANCY_OPERATION_FAILED" })
        : err(result.error as TenancyError);
    }
    return ok(result.value);
  }
}
