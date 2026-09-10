import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { RedisService } from "../../redis/redis.service";
import { PinoLoggerService } from "../../logger/logger.service";
import { MetricsService } from "../../metrics/metrics.service";
import { RealtimeStreamConsumer } from "./realtime-stream.consumer";

const STREAM_KEY = "realtime:events";
const GROUP_PREFIX = "realtime-dispatchers-";
const HEARTBEAT_KEY_PREFIX = "realtime:dispatchers:heartbeat:";

/**
 * Removes dispatcher consumer groups of dead API instances.
 *
 * Every replica consumes the event stream through its own group (see
 * RealtimeStreamConsumer), so crashed or redeployed instances leave orphan
 * groups behind. A group is destroyed only when its heartbeat key has expired,
 * which proves the owner is gone — idle-but-alive instances keep beating.
 */
@Injectable()
export class RealtimeStreamReaper {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly redis: RedisService,
    private readonly consumer: RealtimeStreamConsumer,
    private readonly metrics: MetricsService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "RealtimeStreamReaper" });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reapStaleDispatcherGroups(): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;
    try {
      for (const name of groupNames(await client.xinfo("GROUPS", STREAM_KEY))) {
        if (!name.startsWith(GROUP_PREFIX) || name === this.consumer.groupName) continue;
        const heartbeat = await client.get(`${HEARTBEAT_KEY_PREFIX}${name}`);
        if (heartbeat) continue;
        await client.xgroup("DESTROY", STREAM_KEY, name);
        this.metrics.incrementCounter(
          "realtime_dispatcher_groups_reaped_total",
          "Stale realtime dispatcher groups destroyed",
          1,
        );
        this.logger.info({ group: name }, "Destroyed stale realtime dispatcher group");
      }
    } catch (error) {
      this.logger.error({ error }, "Realtime dispatcher reap failed");
    }
  }
}

function groupNames(info: unknown): string[] {
  if (!Array.isArray(info)) return [];
  const names: string[] = [];
  for (const entry of info) {
    if (!Array.isArray(entry)) continue;
    for (let index = 0; index + 1 < entry.length; index += 2) {
      if (entry[index] === "name" && typeof entry[index + 1] === "string") {
        names.push(entry[index + 1] as string);
      }
    }
  }
  return names;
}
