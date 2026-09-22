import { Injectable, Optional } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { DatabaseService } from "../../../../infrastructure/database";
import type { UserDeletedEventPayload, UserUpdatedEventPayload } from "@repo/contracts";
import { MembershipsRepository } from "../../infrastructure/repositories/memberships.repository";

@Injectable()
export class MembershipUserListener {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly logger: PinoLoggerService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  async updateSnapshots(event: UserUpdatedEventPayload): Promise<Result<void, unknown>> {
    try {
      await this.scoped(() => this.memberships.updateUserSnapshot(event.userId, event.changes));
      return ok(undefined);
    } catch (error) {
      this.logger.error({ error, userId: event.userId }, "Membership snapshot update failed");
      return err(error);
    }
  }

  async removeMemberships(event: UserDeletedEventPayload): Promise<Result<void, unknown>> {
    try {
      await this.scoped(() => this.memberships.removeUser(event.userId));
      return ok(undefined);
    } catch (error) {
      this.logger.error({ error, userId: event.userId }, "Membership cleanup failed");
      return err(error);
    }
  }

  /**
   * Event listeners run outside any request scope. Without a system-scoped
   * transaction their repository calls run without SQL scope and can
   * silently affect no rows under enforced RLS.
   */
  private scoped<T>(fn: () => Promise<T>): Promise<T> {
    if (this.database) return this.database.withSystemScope(fn);
    return fn();
  }
}
