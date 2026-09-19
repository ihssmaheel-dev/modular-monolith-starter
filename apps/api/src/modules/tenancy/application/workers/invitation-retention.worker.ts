import { Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { DatabaseService } from "../../../../infrastructure/database";
import { PurgeExpiredInvitationsCommand } from "../commands/purge-expired-invitations.command";

@Injectable()
export class InvitationRetentionWorker {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly purgeExpired: PurgeExpiredInvitationsCommand,
    logger: PinoLoggerService,
    @Optional() private readonly database?: DatabaseService,
  ) {
    this.logger = logger.child({ module: "InvitationRetentionWorker" });
  }

  @Cron("30 2 * * *")
  async purgeExpiredInvitations(): Promise<number> {
    if (env.PROCESS_ROLE === "api") return 0;
    const run = async (signal?: AbortSignal) => {
      try {
        const result = await this.purgeExpired.execute(undefined, signal);
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
    };

    if (this.database && typeof this.database.withExclusiveExecution === "function") {
      const lockResult = await this.database.withExclusiveExecution(
        "worker:invitation-retention",
        run,
      );
      if (!lockResult.executed) {
        this.logger.info({}, "Invitation retention already executing on another node, skipping");
        return 0;
      }
      return lockResult.result ?? 0;
    }

    return run();
  }
}
