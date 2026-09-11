import { Injectable, Optional } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { DatabaseService } from "../../../../infrastructure/database";
import { UserDeletedEvent, UserUpdatedEvent } from "../../../users/domain/events/user.events";
import { MembershipsRepository } from "../../infrastructure/memberships.repository";

@Injectable()
export class MembershipUserListener {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly logger: PinoLoggerService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  @OnEvent("user.updated")
  async updateSnapshots(event: UserUpdatedEvent): Promise<void> {
    try {
      await this.scoped(() => this.memberships.updateUserSnapshot(event.userId, event.changes));
    } catch (error) {
      this.logger.error({ error, userId: event.userId }, "Membership snapshot update failed");
    }
  }

  @OnEvent("user.deleted")
  async removeMemberships(event: UserDeletedEvent): Promise<void> {
    try {
      await this.scoped(() => this.memberships.removeUser(event.userId));
    } catch (error) {
      this.logger.error({ error, userId: event.userId }, "Membership cleanup failed");
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
