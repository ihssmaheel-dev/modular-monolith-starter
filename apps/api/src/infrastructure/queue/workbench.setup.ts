import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { env } from "../../config/env";
import { PinoLoggerService } from "../logger/logger.service";
import { QueueService } from "./queue.service";
import { OUTBOX_QUEUE } from "../outbox/outbox.constants";
import { FILE_SCAN_QUEUE } from "./queue.constants";

export const DEFAULT_WORKBENCH_PATH = "/ops/queues";

/**
 * Initializes and mounts the Workbench BullMQ operational dashboard onto Fastify.
 *
 * Security & Environment Rules:
 * - Disabled if Redis is not configured (REDIS_URL missing).
 * - In production, disabled unless WORKBENCH_ENABLED=true with validated HTTP Basic Auth.
 * - Standard system queues are pre-registered so they appear in the UI immediately.
 */
export async function setupWorkbench(app: NestFastifyApplication): Promise<void> {
  const logger = app.get(PinoLoggerService).child({ module: "Workbench" });

  if (!env.REDIS_URL) {
    logger.debug({}, "Workbench skipped: REDIS_URL not configured");
    return;
  }

  const isProduction = env.NODE_ENV === "production";
  if (isProduction && !env.WORKBENCH_ENABLED) {
    logger.debug({}, "Workbench skipped: disabled in production (WORKBENCH_ENABLED=false)");
    return;
  }

  try {
    const queueService = app.get(QueueService);

    // Pre-register standard system queues so they appear in the dashboard immediately
    queueService.getQueue(OUTBOX_QUEUE);
    queueService.getQueue("email");
    queueService.getQueue(FILE_SCAN_QUEUE);

    const queues = queueService.getRegisteredQueues();
    if (queues.length === 0) {
      logger.warn({}, "Workbench: no active queues found to monitor");
      return;
    }

    const { workbench } = await import("@getworkbench/fastify");
    const fastify = app.getHttpAdapter().getInstance();
    const routePrefix = env.WORKBENCH_PATH || DEFAULT_WORKBENCH_PATH;

    const authConfig =
      env.WORKBENCH_USER && env.WORKBENCH_PASSWORD
        ? {
            username: env.WORKBENCH_USER,
            password: env.WORKBENCH_PASSWORD,
          }
        : undefined;

    // In production, ensure Workbench assets and inline theme script load through CSP
    fastify.addHook(
      "onSend",
      async (
        request: { url?: string },
        reply: { header: (name: string, value: string) => void },
        payload: unknown,
      ) => {
        const url = request.url?.split("?")[0] ?? "";
        if (url.startsWith(routePrefix)) {
          reply.header(
            "content-security-policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
          );
        }
        return payload;
      },
    );

    // Redirect requests without trailing slash so relative SPA assets resolve correctly
    fastify.get(routePrefix, async (_req, reply) => {
      reply.redirect(`${routePrefix}/`, 302);
    });

    await fastify.register(
      workbench({
        queues,
        title: `${env.APP_NAME} Queue Operations`,
        auth: authConfig,
        readonly: env.WORKBENCH_READONLY,
        tags: ["tenantId", "topic", "userId", "type"],
      }),
      { prefix: routePrefix },
    );

    logger.info(
      {
        path: routePrefix,
        queues: queues.map((q) => q.name),
        readonly: env.WORKBENCH_READONLY,
        authenticated: Boolean(authConfig),
      },
      `BullMQ Workbench dashboard mounted at ${routePrefix}`,
    );
  } catch (error) {
    // Workbench is dev/ops tooling; never prevent application boot if registration fails
    logger.warn({ err: error }, "Failed to mount BullMQ Workbench dashboard");
  }
}
