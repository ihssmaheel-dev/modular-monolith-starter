import { Controller, Req } from "@nestjs/common";
import { Implement, implement } from "../../../infrastructure/orpc/orpc-runtime";
import type { FastifyRequest } from "fastify";
import { organizationsContract } from "@repo/contracts";
import { Idempotent, TenantAgnostic } from "../../../common";
import { invokeOrpc } from "../../../infrastructure/orpc";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import { OrganizationsController } from "./organizations.controller";

@Controller("rpc")
@TenantAgnostic()
// allow-authenticated-only-routes: mirrors OrganizationsController — any
// authenticated user may found an organization; see that file for rationale.
export class OrganizationsOrpcController {
  constructor(
    private readonly organizationsController: OrganizationsController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(organizationsContract.createOrganization)
  @Idempotent()
  createOrganization(@Req() request: FastifyRequest) {
    return implement(organizationsContract.createOrganization).handler(({ input }) =>
      invokeOrpc(
        () => this.organizationsController.create(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(organizationsContract.listOrganizations)
  listOrganizations(@Req() request: FastifyRequest) {
    return implement(organizationsContract.listOrganizations).handler(({ input }) =>
      invokeOrpc(
        () => this.organizationsController.list(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
