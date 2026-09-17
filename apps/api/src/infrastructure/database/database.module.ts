import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { TenantContextService } from "./tenancy/tenant-context.service";

@Global()
@Module({
  providers: [DatabaseService, TenantContextService],
  exports: [DatabaseService, TenantContextService],
})
export class DatabaseModule {}
