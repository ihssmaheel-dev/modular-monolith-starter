import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { NoDatabaseTransaction, Public, RateLimit, TenantAgnostic } from "../../common";
import { ZodValidationPipe } from "../../common/pipes/validation.pipe";
import { PinoLoggerService } from "../logger/logger.service";
import { ClientErrorBeaconSchema, type ClientErrorBeacon } from "@repo/contracts";
import { sanitizeClientUrl, sanitizeErrorText } from "./sanitize-telemetry";

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
    const sanitizedUrl = sanitizeClientUrl(payload.url);
    const sanitizedMessage = sanitizeErrorText(payload.message, 1_000) ?? "Unknown error";
    const sanitizedStack = sanitizeErrorText(payload.stack, 4_000);
    const sanitizedComponentStack = sanitizeErrorText(payload.componentStack, 4_000);

    this.logger.warn(
      {
        source: "client-browser",
        errorRef: payload.errorRef,
        clientUrl: sanitizedUrl,
        userAgent: payload.userAgent,
        stack: sanitizedStack,
        componentStack: sanitizedComponentStack,
      },
      `Client-side runtime error: ${sanitizedMessage}`,
    );
  }
}
