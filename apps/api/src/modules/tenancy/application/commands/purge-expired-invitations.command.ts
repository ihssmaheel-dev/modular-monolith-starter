import { Injectable } from "@nestjs/common";
import { ok, type Result } from "neverthrow";
import { env } from "../../../../config/env";
import type { TenancyError } from "../../domain/errors/tenancy.errors";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository";

const PURGE_BATCH_SIZE = 500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Retention hygiene: delete settled invitations past the retention window in chunks. */
@Injectable()
export class PurgeExpiredInvitationsCommand {
  constructor(private readonly invitations: InvitationsRepository) {}

  async execute(
    retentionDays = env.INVITATION_RETENTION_DAYS,
  ): Promise<Result<number, TenancyError>> {
    const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);
    let purged = 0;
    for (;;) {
      const deleted = await this.invitations.deleteSettledBefore(cutoff, PURGE_BATCH_SIZE);
      purged += deleted;
      if (deleted < PURGE_BATCH_SIZE) break;
    }
    return ok(purged);
  }
}
