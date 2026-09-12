import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import { env } from "../../../../config/env";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";

export type UserDeletionPolicyError = { type: "USER_OWNS_ORGANIZATION" };

@Injectable()
export class CanDeleteUserQuery {
  constructor(private readonly memberships: MembershipsRepository) {}

  async execute(userId: string): Promise<Result<void, UserDeletionPolicyError>> {
    if (env.TENANCY_MODE === "single") return ok(undefined);
    const result = await this.memberships.hasOwnerMembership(userId);
    if (result.isOk() && !result.value) return ok(undefined);
    return err({ type: "USER_OWNS_ORGANIZATION" });
  }
}
