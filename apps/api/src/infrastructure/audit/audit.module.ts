import { Module } from "@nestjs/common";
import { AuditListener } from "./listeners/audit.listener";
import { AuditRetentionWorker } from "./workers/audit-retention.worker";

@Module({
  providers: [AuditListener, AuditRetentionWorker],
  exports: [AuditListener],
})
export class AuditModule {}
