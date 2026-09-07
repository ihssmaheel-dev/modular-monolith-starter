import { Injectable, Optional } from "@nestjs/common";
import { err, Result } from "neverthrow";
import { env } from "../../config/env";
import { PinoLoggerService } from "../logger/logger.service";
import { ResendDriver } from "./drivers/resend.driver";
import { SmtpDriver } from "./drivers/smtp.driver";
import { CircuitBreaker } from "../../common/utils/circuit-breaker";
import { Bulkhead } from "../../common/utils/bulkhead";
import { MetricsService } from "../metrics/metrics.service";
import { TenantContextService } from "../database";
import type { EmailDriver, EmailError, SendEmailParams, SendEmailResult } from "./email.types";

@Injectable()
export class EmailService {
  private driver: EmailDriver | null = null;
  private logger: PinoLoggerService;
  private circuitBreaker: CircuitBreaker<EmailError>;
  private bulkhead: Bulkhead<EmailError>;

  constructor(
    logger: PinoLoggerService,
    private readonly metricsService: MetricsService,
    @Optional() private readonly tenantContext?: TenantContextService,
  ) {
    this.logger = logger.child({ module: "EmailService" });

    this.circuitBreaker = new CircuitBreaker(
      {
        failureThreshold: 3,
        resetTimeoutMs: 15000,
        onStateChange: (state) => {
          const val = state === "CLOSED" ? 0 : state === "HALF_OPEN" ? 1 : 2;
          this.metricsService.setGauge(
            "circuit_breaker_state",
            "Circuit breaker state (0=closed, 1=half, 2=open)",
            val,
            { name: "email" },
          );
          if (state === "OPEN") {
            this.metricsService.incrementCounter(
              "circuit_breaker_trips_total",
              "Total circuit breaker trips",
              1,
              { name: "email" },
            );
          }
        },
      },
      { code: "CIRCUIT_OPEN", message: "api.error.emailCircuitOpen" },
    );

    this.bulkhead = new Bulkhead(
      { maxConcurrent: 10 },
      { code: "BULKHEAD_REJECTED", message: "api.error.emailBulkheadRejected" },
    );

    this.init();
  }

  private init(): void {
    if (env.EMAIL_DRIVER === "resend" && env.RESEND_API_KEY) {
      this.driver = new ResendDriver(this.logger);
      this.logger.info({}, "Email: Resend driver initialized");
    } else {
      this.driver = new SmtpDriver(this.logger);
      this.logger.info(
        { host: env.SMTP_HOST, port: env.SMTP_PORT },
        "Email: SMTP driver initialized",
      );
    }
  }

  async send(params: SendEmailParams): Promise<Result<SendEmailResult, EmailError>> {
    const recipients = Array.isArray(params.to) ? params.to : [params.to];

    if (recipients.length === 0) {
      return err({ code: "INVALID_ADDRESS", message: "api.error.invalidAddress" });
    }

    if (this.driver) {
      const partition = this.tenantContext?.get().tenantId ?? "global";
      return this.bulkhead.execute(
        () => this.circuitBreaker.execute(() => this.driver!.send(recipients, params)),
        partition,
      );
    }

    return err({ code: "CONFIG_ERROR", message: "api.error.configError" });
  }
}
