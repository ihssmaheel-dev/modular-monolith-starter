export { DatabaseModule, DatabaseService } from "./database";
export { CacheModule } from "./cache/cache.module";
export { CacheService } from "./cache/cache.service";
export { StorageModule } from "./storage/storage.module";
export { StorageService } from "./storage/storage.service";
export type { StorageDriver, StorageError, UploadResult, FileInput } from "./storage/storage.types";
export { EmailModule } from "./email/email.module";
export { EmailService } from "./email/email.service";
export { RealtimeModule } from "./realtime/realtime.module";
export { RealtimeService } from "./realtime/realtime.service";
export { RedisModule } from "./redis/redis.module";
export { RedisService } from "./redis/redis.service";
export { QueueModule } from "./queue/queue.module";
export { QueueService } from "./queue/queue.service";
export { LoggerModule } from "./logger/logger.module";
export { PinoLoggerService } from "./logger/logger.service";
export {
  WorkersModule,
  PiscinaService,
  getOptimalWorkerThreadCount,
  type WorkerPoolConfig,
  type WorkerPoolStats,
} from "./workers";
export { SessionModule } from "./session/session.module";
export { SessionService } from "./session/session.service";
export { HealthModule } from "./health/health.module";
export { RateLimitModule } from "./rate-limit/rate-limit.module";
export { RateLimitService } from "./rate-limit/rate-limit.service";
export { WafModule } from "./waf/waf.module";
export { I18nModule } from "./i18n/i18n.module";
export { I18nService } from "./i18n/i18n.service";
export { FeatureFlagsModule } from "./feature-flags/feature-flags.module";
export { FeatureFlagsService } from "./feature-flags/feature-flags.service";
export type { FeatureFlagContext, FeatureFlagProvider } from "./feature-flags/feature-flags.types";
export { AuthorizationModule, AuthorizationService } from "./authorization";
export { setupApiDocs } from "./api-docs";
export { ErrorReportingModule, ErrorReporterService } from "./error-reporting";
export type { ErrorReport, ErrorReportContext, ErrorReporter } from "./error-reporting";
