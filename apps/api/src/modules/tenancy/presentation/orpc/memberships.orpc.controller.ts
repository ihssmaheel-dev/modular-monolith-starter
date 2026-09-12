import { Controller, Req } from "@nestjs/common";
import { Implement, implement } from "../../../../infrastructure/orpc/orpc-runtime";
import type { FastifyRequest } from "fastify";
import { membershipsContract } from "@repo/contracts";
import { Idempotent, RequirePermission, TenantAgnostic } from "../../../../common";
import { invokeOrpc } from "../../../../infrastructure/orpc";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { MembershipsController } from "../controllers/memberships.controller";

@Controller("rpc")
export class MembershipsOrpcController {
  constructor(
    private readonly membershipsController: MembershipsController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(membershipsContract.listMembers)
  @RequirePermission("team:read")
  listMembers(@Req() request: FastifyRequest) {
    return implement(membershipsContract.listMembers).handler(({ input }) =>
      invokeOrpc(
        () => this.membershipsController.listMemberPage(input.query, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(membershipsContract.updateMember)
  @Idempotent()
  @RequirePermission("team:manage")
  updateMember(@Req() request: FastifyRequest) {
    return implement(membershipsContract.updateMember).handler(({ input }) =>
      invokeOrpc(
        () => this.membershipsController.update(input.params.userId, input.body, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(membershipsContract.removeMember)
  @Idempotent()
  @RequirePermission("team:remove")
  removeMember(@Req() request: FastifyRequest) {
    return implement(membershipsContract.removeMember).handler(({ input }) =>
      invokeOrpc(
        () => this.membershipsController.remove(input.params.userId, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(membershipsContract.inviteMember)
  @Idempotent()
  @RequirePermission("team:invite")
  inviteMember(@Req() request: FastifyRequest) {
    return implement(membershipsContract.inviteMember).handler(({ input }) =>
      invokeOrpc(
        () => this.membershipsController.invite(input.body, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(membershipsContract.listInvitations)
  @RequirePermission("team:read")
  listInvitations(@Req() request: FastifyRequest) {
    return implement(membershipsContract.listInvitations).handler(({ input }) =>
      invokeOrpc(
        () => this.membershipsController.listInvitationPage(input.query, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(membershipsContract.acceptInvitation)
  @TenantAgnostic()
  @Idempotent()
  acceptInvitation(@Req() request: FastifyRequest) {
    return implement(membershipsContract.acceptInvitation).handler(({ input }) =>
      invokeOrpc(
        () => this.membershipsController.accept(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
