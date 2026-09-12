import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { Public, TenantAgnostic, ResponseSchema } from "../../../../common";
import { env } from "../../../../config/env";
import { TenantStatusResponseSchema, type TenantStatusResponse } from "@repo/contracts";

@Controller("tenancy")
@TenantAgnostic()
export class TenancyStatusController {
  @Get("status")
  @HttpCode(HttpStatus.OK)
  @Public()
  @ResponseSchema(TenantStatusResponseSchema)
  status(): TenantStatusResponse {
    return { mode: env.TENANCY_MODE, header: "x-tenant-id" };
  }
}
