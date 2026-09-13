import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { NoDatabaseTransaction, Public, RateLimit, TenantAgnostic } from "../../common";
import { ZodValidationPipe } from "../../common/pipes/validation.pipe";
import { PinoLoggerService } from "../logger/logger.service";
import { ClientErrorBeaconSchema, type ClientErrorBeacon } from "@repo/contracts";

// Client telemetry controller for browser runtime errors

@Controller("telemetry")
@TenantAgnostic()
export class ClientErrorController {
  private readonly logger: PinoLoggerService;

  constructor(logger: PinoLoggerService) {
    this.logger = logger.child({ component: "client-telemetry" });
  }

  @Post("client-error")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Public()
  @NoDatabaseTransaction()
  @RateLimit(30, 60)
  reportClientError(
    @Body(new ZodValidationPipe(ClientErrorBeaconSchema)) payload: ClientErrorBeacon,
  ): void {
    this.logger.warn(
      {
        source: "client-browser",
        errorRef: payload.errorRef,
        clientUrl: payload.url,
        userAgent: payload.userAgent,
        stack: payload.stack,
        componentStack: payload.componentStack,
      },
      `Client-side runtime error: ${payload.message}`,
    );
  }
}
