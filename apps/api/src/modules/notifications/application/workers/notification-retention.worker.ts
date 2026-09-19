import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { env } from "../../../../config/env";
import { DatabaseService } from "../../../../infrastructure/database";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { DeliveryIntentsRepository } from "../../infrastructure/repositories/delivery-intents.repository";

const DELIVERED_RETENTION_DAYS = 14;
const DEAD_RETENTION_DAYS = 30;
const RETENTION_BATCH_SIZE = 1000;
const RETENTION_MAX_BATCHES = 10;

@Injectable()
export class NotificationRetentionWorker {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly intents: DeliveryIntentsRepository,
    private readonly database: DatabaseService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "NotificationRetentionWorker" });
  }

  @Cron("30 3 * * *")
  async pruneExpiredIntents(): Promise<number> {
    if (env.PROCESS_ROLE === "api") return 0;
    const run = async () => {
      try {
        const deliveredCutoff = new Date(
          Date.now() - DELIVERED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        );
        const deadCutoff = new Date(Date.now() - DEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        let totalPruned = 0;
        for (let index = 0; index < RETENTION_MAX_BATCHES; index += 1) {
          const deleted = await this.database.runTransaction(() =>
            this.intents.deleteOldIntents(deliveredCutoff, deadCutoff, RETENTION_BATCH_SIZE),
          );
          totalPruned += deleted;
          if (deleted < RETENTION_BATCH_SIZE) break;
        }

        if (totalPruned > 0) {
          this.logger.info({ totalPruned }, "Pruned expired notification delivery intents");
        }
        return totalPruned;
      } catch (error) {
        this.logger.error({ error }, "Notification delivery intents retention run failed");
        return 0;
      }
    };

    if (typeof this.database.withExclusiveExecution === "function") {
      const lockResult = await this.database.withExclusiveExecution(
        "worker:notification-retention",
        run,
      );
      if (!lockResult.executed) {
        this.logger.info({}, "Notification retention already executing on another node, skipping");
        return 0;
      }
      return lockResult.result ?? 0;
    }

    return run();
  }
}
