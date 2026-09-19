import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ClsModule, ClsService } from "nestjs-cls";
import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { NotesModule } from "./modules/notes/notes.module";
import { FilesModule } from "./modules/files/files.module";
import { PrivacyModule } from "./modules/privacy/privacy.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { TenancyModule } from "./modules/tenancy/tenancy.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { QueueModule } from "./infrastructure/queue/queue.module";
import { LoggerModule } from "./infrastructure/logger/logger.module";
import { WorkersModule } from "./infrastructure/workers/workers.module";
import { DatabaseModule } from "./infrastructure/database";
import { CacheModule } from "./infrastructure/cache/cache.module";
import { StorageModule } from "./infrastructure/storage/storage.module";
import { EmailModule } from "./infrastructure/email/email.module";
import { RealtimeModule } from "./infrastructure/realtime/realtime.module";
import { SessionModule } from "./infrastructure/session/session.module";
import { HealthModule } from "./infrastructure/health/health.module";
import { RateLimitModule } from "./infrastructure/rate-limit/rate-limit.module";
import { WafModule } from "./infrastructure/waf/waf.module";
import { SecurityModule } from "./infrastructure/security/security.module";
import { I18nModule } from "./infrastructure/i18n/i18n.module";
import { I18nService } from "./infrastructure/i18n/i18n.service";
import { createApiErrorEnvelope } from "./common/utils/error-envelope.utils";
import { FeatureFlagsModule } from "./infrastructure/feature-flags";
import { AuditModule } from "./infrastructure/audit/audit.module";
import { OperationReceiptModule } from "./infrastructure/idempotency/operation-receipt.module";
import { DataLifecycleModule } from "./infrastructure/lifecycle/data-lifecycle.module";
import { OutboxModule } from "./infrastructure/outbox/outbox.module";
import { ErrorReportingModule } from "./infrastructure/error-reporting";
import { AuthorizationModule } from "./infrastructure/authorization";
import { APP_INTERCEPTOR, APP_GUARD } from "@nestjs/core";
import { MetricsModule } from "./infrastructure/metrics/metrics.module";
import { MetricsInterceptor } from "./infrastructure/metrics/metrics.interceptor";
import { TracingInterceptor } from "./infrastructure/tracing/tracing.interceptor";
import {
  AuthGuard,
  CsrfGuard,
  PermissionsGuard,
  IdempotencyInterceptor,
  RateLimitGuard,
  AggregateRateLimitGuard,
  TenantContextGuard,
  OriginValidationInterceptor,
  RequestIdInterceptor,
  LoggingInterceptor,
  ResponseValidationInterceptor,
} from "./common";
import { ORPCModule } from "./infrastructure/orpc/orpc-runtime";
import { env } from "./config/env";

export const REFERENCE_FEATURE_MODULES = [NotesModule] as const;

export function applicationFeatureModules(includeExamples = env.EXAMPLE_FEATURES_ENABLED) {
  return [
    TenancyModule.forRoot(),
    UsersModule,
    AuthModule,
    FilesModule,
    PrivacyModule,
    NotificationsModule,
    ...(includeExamples ? REFERENCE_FEATURE_MODULES : []),
  ];
}

@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    RedisModule,
    ORPCModule.forRootAsync({
      inject: [I18nService, ClsService],
      useFactory: (i18n: I18nService, cls: ClsService) => ({
        customErrorResponseBodyEncoder(error: {
          status?: number;
          code?: string;
          message?: string;
          data?: unknown;
        }) {
          const requestId = (cls?.isActive() ? cls.get("requestId") : undefined) ?? randomUUID();
          const envelope = createApiErrorEnvelope(
            error,
            error.status ?? 400,
            undefined,
            requestId,
            i18n,
          );
          return {
            defined: false,
            code: envelope.code,
            status: envelope.status,
            message: envelope.message,
            i18nKey: envelope.i18nKey,
            fieldErrors: envelope.fieldErrors,
            requestId: envelope.requestId,
            ...(envelope.traceId ? { traceId: envelope.traceId } : {}),
            ...(envelope.errorRef ? { errorRef: envelope.errorRef } : {}),
            ...(envelope.retry ? { retry: envelope.retry } : {}),
            data: envelope,
          };
        },
      }),
    }),
    QueueModule,
    LoggerModule,
    WorkersModule,
    DatabaseModule,
    CacheModule,
    StorageModule,
    EmailModule,
    RealtimeModule,
    SessionModule,
    HealthModule,
    RateLimitModule,
    WafModule,
    SecurityModule,
    I18nModule,
    FeatureFlagsModule,
    MetricsModule,
    AuditModule,
    OperationReceiptModule,
    DataLifecycleModule,
    OutboxModule,
    ErrorReportingModule,
    AuthorizationModule,
    ...applicationFeatureModules(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    // Rate limiting runs before any expensive work (tenant resolution,
    // permission evaluation) so unauthenticated floods are shed cheaply.
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AggregateRateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: OriginValidationInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TracingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseValidationInterceptor,
    },
  ],
})
export class AppModule {}
