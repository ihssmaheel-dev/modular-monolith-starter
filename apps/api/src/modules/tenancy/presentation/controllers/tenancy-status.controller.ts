import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { Public, TenantAgnostic, ResponseSchema } from "../../../../common";
import { TenantStatusResponseSchema, type TenantStatusResponse } from "@repo/contracts";
import { GetTenancyStatusQuery } from "../../application/queries/get-tenancy-status.query";

@Controller("tenancy")
@TenantAgnostic()
export class TenancyStatusController {
  constructor(private readonly getTenancyStatusQuery: GetTenancyStatusQuery) {}

  @Get("status")
  @HttpCode(HttpStatus.OK)
  @Public()
  @ResponseSchema(TenantStatusResponseSchema)
  status(): TenantStatusResponse {
    return this.getTenancyStatusQuery.execute();
  }
}
