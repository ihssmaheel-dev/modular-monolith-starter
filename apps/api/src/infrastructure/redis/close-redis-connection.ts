import type Redis from "ioredis";

export const REDIS_SHUTDOWN_TIMEOUT_MS = 5_000;

/** A stalled socket must not prevent the remaining application shutdown hooks. */
export async function closeRedisConnection(
  client: Pick<Redis, "quit" | "disconnect">,
): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.quit(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("Redis shutdown deadline exceeded")),
          REDIS_SHUTDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (deadline) clearTimeout(deadline);
    // Also stop reconnection when QUIT rejected or its reply never arrived.
    client.disconnect();
  }
}
