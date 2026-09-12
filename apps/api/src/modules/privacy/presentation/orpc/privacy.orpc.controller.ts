import { Controller, Req } from "@nestjs/common";
import { Implement, implement } from "../../../../infrastructure/orpc/orpc-runtime";
import type { FastifyRequest } from "fastify";
import { privacyContract } from "@repo/contracts";
import { Idempotent, RequirePermission, TenantAgnostic } from "../../../../common";
import { invokeOrpc } from "../../../../infrastructure/orpc";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { PrivacyController } from "../controllers/privacy.controller";

@Controller("rpc")
@TenantAgnostic()
export class PrivacyOrpcController {
  constructor(
    private readonly privacyController: PrivacyController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(privacyContract.requestExport)
  @RequirePermission("privacy:export:self")
  requestExport(@Req() request: FastifyRequest) {
    return implement(privacyContract.requestExport).handler(() =>
      invokeOrpc(
        () => this.privacyController.export(request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(privacyContract.downloadExport)
  @RequirePermission("privacy:export:self")
  downloadExport(@Req() request: FastifyRequest) {
    return implement(privacyContract.downloadExport).handler(({ input }) =>
      invokeOrpc(
        () => this.privacyController.download(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(privacyContract.listRequests)
  @RequirePermission("privacy:export:self")
  listRequests(@Req() request: FastifyRequest) {
    return implement(privacyContract.listRequests).handler(({ input }) =>
      invokeOrpc(
        () => this.privacyController.listMine(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(privacyContract.requestAccountErasure)
  @Idempotent()
  @RequirePermission("privacy:erase:self")
  requestAccountErasure(@Req() request: FastifyRequest) {
    return implement(privacyContract.requestAccountErasure).handler(({ input }) =>
      invokeOrpc(
        () => this.privacyController.eraseAccount(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(privacyContract.requestOrganizationErasure)
  @Idempotent()
  requestOrganizationErasure(@Req() request: FastifyRequest) {
    // No coarse permission: TenantAgnostic routes carry no tenant role, so
    // owners could never satisfy privacy:erase:tenant at the guard. The
    // command enforces organization ownership on trusted membership reads.
    return implement(privacyContract.requestOrganizationErasure).handler(({ input }) =>
      invokeOrpc(
        () => this.privacyController.eraseOrganization(input.organizationId, input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(privacyContract.listAllRequests)
  @RequirePermission("privacy:requests:read")
  listAllRequests(@Req() request: FastifyRequest) {
    return implement(privacyContract.listAllRequests).handler(({ input }) =>
      invokeOrpc(
        () => this.privacyController.listAll(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(privacyContract.purgeExpired)
  @RequirePermission("privacy:requests:read")
  purgeExpired(@Req() request: FastifyRequest) {
    return implement(privacyContract.purgeExpired).handler(() =>
      invokeOrpc(
        () => this.privacyController.purge(request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
