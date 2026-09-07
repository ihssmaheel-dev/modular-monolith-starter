import { Controller, Req } from "@nestjs/common";
import { Implement, implement } from "../../../infrastructure/orpc/orpc-runtime";
import type { FastifyRequest } from "fastify";
import { notificationsContract } from "@repo/contracts";
import { Idempotent, RequirePermission, TenantAgnostic } from "../../../common";
import { invokeOrpc } from "../../../infrastructure/orpc";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import { NotificationsController } from "./notifications.controller";

@Controller("rpc")
@TenantAgnostic()
export class NotificationsOrpcController {
  constructor(
    private readonly notificationsController: NotificationsController,
    private readonly i18n: I18nService,
  ) {}

  @Implement(notificationsContract.list)
  @RequirePermission("notifications:read")
  list(@Req() request: FastifyRequest) {
    return implement(notificationsContract.list).handler(({ input }) =>
      invokeOrpc(
        () => this.notificationsController.list(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notificationsContract.unreadCount)
  @RequirePermission("notifications:read")
  unreadCount(@Req() request: FastifyRequest) {
    return implement(notificationsContract.unreadCount).handler(() =>
      invokeOrpc(
        () => this.notificationsController.unreadCount(request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notificationsContract.markRead)
  @RequirePermission("notifications:write")
  markRead(@Req() request: FastifyRequest) {
    return implement(notificationsContract.markRead).handler(({ input }) =>
      invokeOrpc(
        () => this.notificationsController.markOneRead(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notificationsContract.markAllRead)
  @RequirePermission("notifications:write")
  markAllRead(@Req() request: FastifyRequest) {
    return implement(notificationsContract.markAllRead).handler(() =>
      invokeOrpc(
        () => this.notificationsController.markAllRead(request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notificationsContract.getPreferences)
  @RequirePermission("notifications:read")
  getPreferences(@Req() request: FastifyRequest) {
    return implement(notificationsContract.getPreferences).handler(() =>
      invokeOrpc(
        () => this.notificationsController.getPreferences(request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notificationsContract.updatePreferences)
  @RequirePermission("notifications:write")
  updatePreferences(@Req() request: FastifyRequest) {
    return implement(notificationsContract.updatePreferences).handler(({ input }) =>
      invokeOrpc(
        () => this.notificationsController.putPreferences(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notificationsContract.registerDevice)
  @Idempotent()
  @RequirePermission("notifications:write")
  registerDevice(@Req() request: FastifyRequest) {
    return implement(notificationsContract.registerDevice).handler(({ input }) =>
      invokeOrpc(
        () => this.notificationsController.addDevice(input, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }

  @Implement(notificationsContract.deleteDevice)
  @Idempotent()
  @RequirePermission("notifications:write")
  deleteDevice(@Req() request: FastifyRequest) {
    return implement(notificationsContract.deleteDevice).handler(({ input }) =>
      invokeOrpc(
        () => this.notificationsController.deleteDevice(input.id, request),
        this.i18n,
        request.headers["accept-language"],
      ),
    );
  }
}
