import { setGlobalDispatcher, Agent } from "undici";
import { randomUUID } from "node:crypto";
import "./tracing";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { WsAdapter } from "@nestjs/platform-ws";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import cookie from "@fastify/cookie";
import underPressure from "@fastify/under-pressure";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { PinoLoggerService } from "./infrastructure/logger/logger.service";
import { I18nService } from "./infrastructure/i18n/i18n.service";
import { env } from "./config/env";
import { setupApiDocs } from "./infrastructure/api-docs";
import { printStartupBanner } from "./common/utils/startup-banner.util";
import { isTrustedOrigin } from "./common/utils/origin.utils";
import {
  API_BASE_PATH,
  API_DOCS_PATH,
  API_GLOBAL_PREFIX,
  MAX_FILE_SIZE_BYTES,
} from "@repo/contracts";
import { ClsService } from "nestjs-cls";
import { ErrorReporterService } from "./infrastructure/error-reporting";
import { DatabaseService, verifyTenancyMode } from "./infrastructure/database";

// Configure high-performance global HTTP agent
setGlobalDispatcher(
  new Agent({
    connections: 100,
    keepAliveTimeout: 15 * 60 * 1000,
  }),
);

const MAX_BODY_SIZE_BYTES = 1048576; // 1MB

const UNDER_PRESSURE_MAX_EVENT_LOOP_DELAY_MS = 1000;
const UNDER_PRESSURE_MAX_EVENT_LOOP_UTILIZATION = 0.98;
const UNDER_PRESSURE_RETRY_AFTER_SECONDS = 30;
// Probes and docs must keep answering during load spikes so the
// orchestrator does not restart a merely busy (not dead) process.
const UNDER_PRESSURE_BYPASS_PREFIXES = [
  `${API_BASE_PATH}/health`,
  "/metrics",
  API_DOCS_PATH,
  "/docs",
];

interface FastifyPressureRequest {
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface FastifyPressureReply {
  code: (status: number) => FastifyPressureReply;
  header: (name: string, value: number) => FastifyPressureReply;
  send: (payload: unknown) => void;
}

async function bootstrap() {
  if (env.PROCESS_ROLE === "worker") {
    const workerApp = await NestFactory.createApplicationContext(AppModule);
    workerApp.enableShutdownHooks();
    await verifyTenancyMode(workerApp.get(DatabaseService), workerApp.get(PinoLoggerService));
    return;
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: MAX_BODY_SIZE_BYTES,
      trustProxy: env.TRUST_PROXY,
    }),
  );

  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      "application/octet-stream",
      { bodyLimit: MAX_FILE_SIZE_BYTES },
      (_request, payload, done) => done(null, payload),
    );

  await app.register(helmet as unknown as never, {
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(compress as unknown as never, {
    threshold: 1024,
    encodings: ["gzip", "deflate", "br"],
  });

  await app.register(cookie as unknown as never, {
    secret: env.JWT_SECRET,
    hook: "onRequest",
  });

  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", (request, reply, done) => {
      const requestCookies = request as typeof request & {
        cookies?: Record<string, string | undefined>;
      };
      const replyWithCookies = reply as typeof reply & {
        setCookie: (name: string, value: string, options: Record<string, unknown>) => void;
      };
      if (!requestCookies.cookies?.["XSRF-TOKEN"]) {
        replyWithCookies.setCookie("XSRF-TOKEN", randomUUID(), {
          httpOnly: false,
          secure: env.NODE_ENV === "production",
          // Lax (not Strict): the token must ride along on top-level
          // navigation from email links and across same-site subdomains,
          // while cross-site POSTs still omit it. Mutations additionally
          // require the double-submit header (see CsrfGuard).
          sameSite: "lax",
          path: "/",
          maxAge: 24 * 60 * 60,
        });
      }
      done();
    });

  // Register API docs BEFORE the versioned global prefix so /api/docs remains stable.
  if (env.NODE_ENV !== "production") {
    await setupApiDocs(app);
  }

  app.useWebSocketAdapter(new WsAdapter(app));

  const logger = app.get(PinoLoggerService);
  const i18n = app.get(I18nService);
  app.useGlobalFilters(
    new AllExceptionsFilter(logger, i18n, app.get(ClsService), app.get(ErrorReporterService)),
  );

  await app.register(underPressure as unknown as never, {
    maxEventLoopDelay: UNDER_PRESSURE_MAX_EVENT_LOOP_DELAY_MS,
    maxEventLoopUtilization: UNDER_PRESSURE_MAX_EVENT_LOOP_UTILIZATION,
    retryAfter: UNDER_PRESSURE_RETRY_AFTER_SECONDS,
    pressureHandler: (
      request: FastifyPressureRequest,
      reply: FastifyPressureReply,
      type: string,
    ) => {
      const url = request.url?.split("?")[0] ?? "";
      // Let probes and docs through; returning without sending lets
      // Fastify handle the request normally.
      if (UNDER_PRESSURE_BYPASS_PREFIXES.some((prefix) => url.startsWith(prefix))) return;
      logger.warn({ pressureType: type, url }, "Shedding load: server under pressure");
      reply
        .code(503)
        .header("Retry-After", UNDER_PRESSURE_RETRY_AFTER_SECONDS)
        .send({
          statusCode: 503,
          message: i18n.t(
            "api.error.serviceUnavailable",
            request.headers?.["accept-language"]?.toString(),
          ),
          error: "UNDER_PRESSURE",
        });
    },
  });

  app.setGlobalPrefix(API_GLOBAL_PREFIX, { exclude: ["metrics", "docs", "api/docs"] });
  app.enableCors({
    origin: (origin, callback) => {
      // One trust rule (see common/utils/origin.utils): configured origins
      // always, plus any loopback origin outside production. Absent Origin
      // (curl, mobile apps) is not a browser cross-origin request.
      callback(null, !origin || isTrustedOrigin(origin));
    },
    credentials: true,
    allowedHeaders:
      "authorization,content-type,accept,origin,x-requested-with,x-tenant-id,idempotency-key,accept-language,x-xsrf-token,x-csrf-token,scalar-origin",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    maxAge: 86400,
  });

  app.enableShutdownHooks();

  await verifyTenancyMode(app.get(DatabaseService), logger);

  await app.listen(env.PORT, "0.0.0.0");

  printStartupBanner(app, logger);
  logger.info({ port: env.PORT }, "API bootstrap complete");
}

bootstrap();
