import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import type { Invitation } from "../../domain/entities/tenancy.entity";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository";

export const MAX_INVITATIONS_PER_EMAIL = 100;

@Injectable()
export class ListInvitationsByEmailQuery {
  constructor(private readonly invitations: InvitationsRepository) {}

  async execute(
    email: string,
    limit = MAX_INVITATIONS_PER_EMAIL,
  ): Promise<Result<Invitation[], TenancyError>> {
    const safeLimit = Math.min(Math.max(1, limit), MAX_INVITATIONS_PER_EMAIL);
    const result = await this.invitations.find({ email });
    if (result.isErr()) return ok([]);
    return ok(result.value.slice(0, safeLimit));
  }
}
