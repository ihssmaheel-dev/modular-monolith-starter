import { Module } from "@nestjs/common";
import { ClsModule } from "nestjs-cls";
import { DatabaseModule, DatabaseService, TenantContextService } from "../infrastructure/database";
import { LoggerModule } from "../infrastructure/logger/logger.module";
import { UsersRepository } from "../modules/users/infrastructure/repositories/users.repository";

@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: false } }),
    LoggerModule,
    DatabaseModule,
  ],
  providers: [
    {
      provide: UsersRepository,
      useFactory: (database: DatabaseService, tenantContext: TenantContextService) =>
        new UsersRepository(database, tenantContext),
      inject: [DatabaseService, TenantContextService],
    },
  ],
  exports: [UsersRepository],
})
export class SeedModule {}
