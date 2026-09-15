import { Controller, Get } from "@nestjs/common";
import { HealthCheck } from "@nestjs/terminus";
import { AppHealthService } from "./health.service";
import { NoDatabaseTransaction, Public, ResponseSchema } from "../../common";
import { HealthCheckResponseSchema, type HealthCheckResponse } from "@repo/contracts";

@Controller("health")
@Public()
@NoDatabaseTransaction()
export class HealthController {
  constructor(private readonly healthService: AppHealthService) {}

  @Get()
  @HealthCheck()
  @ResponseSchema(HealthCheckResponseSchema)
  health(): Promise<HealthCheckResponse> {
    return this.healthService.check();
  }

  @Get("ready")
  @HealthCheck()
  @ResponseSchema(HealthCheckResponseSchema)
  readiness(): Promise<HealthCheckResponse> {
    return this.healthService.checkReadiness();
  }

  @Get("live")
  @ResponseSchema(HealthCheckResponseSchema)
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }
}
