import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ClsModule } from "nestjs-cls";
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
import { FeatureFlagsModule } from "./infrastructure/feature-flags";
import { AuditModule } from "./infrastructure/audit/audit.module";
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
  TenantContextGuard,
  OriginValidationInterceptor,
  RequestIdInterceptor,
  DatabaseTransactionInterceptor,
  LoggingInterceptor,
  ResponseValidationInterceptor,
} from "./common";
import { ORPCModule } from "./infrastructure/orpc/orpc-runtime";

@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ORPCModule.forRoot({}),
    RedisModule,
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
    OutboxModule,
    ErrorReportingModule,
    AuthorizationModule,
    TenancyModule.forRoot(),
    UsersModule,
    AuthModule,
    NotesModule,
    FilesModule,
    PrivacyModule,
    NotificationsModule,
  ],
  providers: [
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
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
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
      useClass: OriginValidationInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DatabaseTransactionInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseValidationInterceptor,
    },
  ],
})
export class AppModule {}
