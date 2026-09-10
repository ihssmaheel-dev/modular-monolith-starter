import type { MetricsService } from "../../metrics/metrics.service";

const MAX_DELIVERY_ATTEMPTS = 5;
const DEAD_LETTER_STREAM_KEY = "realtime:events:dead-letter";

export type RedisStreamEntry = [id: string, fields: string[]];
export type RedisStreamResult = [stream: string, messages: RedisStreamEntry[]][] | null;

export type GroupedRedis = {
  xreadgroup?: (...args: Array<string | number>) => Promise<RedisStreamResult>;
  xack: (stream: string, group: string, id: string) => Promise<number>;
  xautoclaim?: (...args: Array<string | number>) => Promise<unknown>;
  incr?: (key: string) => Promise<number>;
  expire?: (key: string, seconds: number) => Promise<number>;
  xadd?: (...args: Array<string | number>) => Promise<string>;
  del?: (key: string) => Promise<number>;
  setex?: (key: string, seconds: number, value: string) => Promise<unknown>;
};

/**
 * Moves a message to the dead-letter stream once its per-group delivery
 * budget is exhausted. Attempt counters are scoped per dispatcher group:
 * under fan-out every replica evaluates the same message, so each group
 * gets its own budget.
 */
export async function handleFailedDelivery(
  client: GroupedRedis,
  groupName: string,
  id: string,
  fields: string[],
  metrics: MetricsService,
): Promise<boolean> {
  if (!client.incr) return false;
  const attemptKey = `realtime:events:attempts:${groupName}:${id}`;
  const attempts = await client.incr(attemptKey);
  if (client.expire) await client.expire(attemptKey, 3600);
  if (attempts < MAX_DELIVERY_ATTEMPTS) return false;
  if (client.xadd) {
    await client.xadd(
      DEAD_LETTER_STREAM_KEY,
      "*",
      "sourceId",
      id,
      "fields",
      JSON.stringify(fields),
    );
  }
  if (client.del) await client.del(attemptKey);
  metrics.incrementCounter("realtime_dead_letter_total", "Realtime events moved to dead letter", 1);
  return true;
}
