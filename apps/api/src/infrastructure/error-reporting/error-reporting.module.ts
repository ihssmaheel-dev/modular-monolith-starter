import { Global, Module } from "@nestjs/common";
import { ErrorReporterService } from "./error-reporter.service";
import { ClientErrorController } from "./client-error.controller";

@Global()
@Module({
  controllers: [ClientErrorController],
  providers: [ErrorReporterService],
  exports: [ErrorReporterService],
})
export class ErrorReportingModule {}
