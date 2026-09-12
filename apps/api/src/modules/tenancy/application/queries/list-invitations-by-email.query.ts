import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import type { Invitation } from "../../domain/entities/tenancy.entity";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository";

@Injectable()
export class ListInvitationsByEmailQuery {
  constructor(private readonly invitations: InvitationsRepository) {}

  async execute(email: string): Promise<Result<Invitation[], TenancyError>> {
    const result = await this.invitations.find({ email });
    if (result.isErr()) return ok([]);
    return ok(result.value);
  }
}
