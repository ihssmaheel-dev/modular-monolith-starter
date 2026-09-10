import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { PurgeExpiredInvitationsCommand } from "../commands/purge-expired-invitations.command";

@Injectable()
export class InvitationRetentionWorker {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly purgeExpired: PurgeExpiredInvitationsCommand,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "InvitationRetentionWorker" });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredInvitations(): Promise<number> {
    if (env.PROCESS_ROLE === "api") return 0;
    try {
      const result = await this.purgeExpired.execute();
      if (result.isErr()) {
        this.logger.error({ error: result.error }, "Invitation retention run failed");
        return 0;
      }
      if (result.value > 0)
        this.logger.info({ purged: result.value }, "Expired invitations purged");
      return result.value;
    } catch (error) {
      this.logger.error({ error }, "Invitation retention run failed");
      return 0;
    }
  }
}
