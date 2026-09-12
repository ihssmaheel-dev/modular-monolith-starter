import { Controller } from "@nestjs/common";
import { Implement, implement } from "../../../../infrastructure/orpc/orpc-runtime";
import { organizationsContract } from "@repo/contracts";
import { Public, TenantAgnostic } from "../../../../common";
import { TenancyStatusController } from "../controllers/tenancy-status.controller";

@Controller("rpc")
@TenantAgnostic()
export class TenancyStatusOrpcController {
  constructor(private readonly statusController: TenancyStatusController) {}

  @Implement(organizationsContract.status)
  @Public()
  status() {
    return implement(organizationsContract.status).handler(() => this.statusController.status());
  }
}
