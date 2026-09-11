import { Controller, Req } from "@nestjs/common";
import { Implement, implement } from "../../../infrastructure/orpc/orpc-runtime";
import type { FastifyRequest } from "fastify";
import { usersContract } from "@repo/contracts";
import { Idempotent, Public, RequirePermission, TenantAgnostic } from "../../../common";
import { invokeOrpc } from "../../../infrastructure/orpc";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import { UsersController } from "./users.controller";
import { UsersEmailChangeController } from "./users-email-change.controller";

@Controller("rpc")
@TenantAgnostic()
export class UsersOrpcController {
  constructor(
    private readonly usersController: UsersController,
    private readonly emailChangeController: UsersEmailChangeController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(usersContract.list)
  @RequirePermission("users:read")
  list(@Req() request: FastifyRequest) {
    return implement(usersContract.list).handler(({ input }) =>
      invokeOrpc(
        () => this.usersController.list(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.getById)
  @RequirePermission("users:read")
  getById(@Req() request: FastifyRequest) {
    return implement(usersContract.getById).handler(({ input }) =>
      invokeOrpc(
        () => this.usersController.getById(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.create)
  @Idempotent()
  @RequirePermission("users:write")
  create(@Req() request: FastifyRequest) {
    return implement(usersContract.create).handler(({ input }) =>
      invokeOrpc(
        () => this.usersController.create(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.update)
  @Idempotent()
  @RequirePermission("users:write")
  update(@Req() request: FastifyRequest) {
    return implement(usersContract.update).handler(({ input }) =>
      invokeOrpc(
        () => this.usersController.update(input.id, input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.delete)
  @Idempotent()
  @RequirePermission("users:delete")
  delete(@Req() request: FastifyRequest) {
    return implement(usersContract.delete).handler(({ input }) =>
      invokeOrpc(
        () => this.usersController.delete(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.updateMe)
  @Idempotent()
  updateMe(@Req() request: FastifyRequest) {
    return implement(usersContract.updateMe).handler(({ input }) =>
      invokeOrpc(
        () => this.usersController.updateMe(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.requestEmailChange)
  @Idempotent()
  requestEmailChange(@Req() request: FastifyRequest) {
    return implement(usersContract.requestEmailChange).handler(({ input }) =>
      invokeOrpc(
        () => this.emailChangeController.requestEmailChange(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.verifyEmailChange)
  @Idempotent()
  @Public()
  verifyEmailChange(@Req() request: FastifyRequest) {
    return implement(usersContract.verifyEmailChange).handler(({ input }) =>
      invokeOrpc(
        () => this.emailChangeController.verifyEmailChange(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.attachAvatar)
  @Idempotent()
  @RequirePermission("users:write")
  attachAvatar(@Req() request: FastifyRequest) {
    return implement(usersContract.attachAvatar).handler(({ input }) =>
      invokeOrpc(
        () => this.usersController.attachAvatar(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(usersContract.removeAvatar)
  @Idempotent()
  @RequirePermission("users:write")
  removeAvatar(@Req() request: FastifyRequest) {
    return implement(usersContract.removeAvatar).handler(() =>
      invokeOrpc(
        () => this.usersController.removeAvatar(request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
