import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  Idempotent,
  RequirePermission,
  TenantAgnostic,
  requireAuthenticatedUser,
  ResponseSchema,
} from "../../../../common";
import { ZodValidationPipe } from "../../../../common/pipes/validation.pipe";
import {
  type DeviceResponse,
  type NotificationListResponse,
  type NotificationResponse,
  type PaginationQuery,
  type PreferencesResponse,
  type RegisterDeviceInput,
  type UnreadCountResponse,
  type UpdatePreferencesInput,
  DeviceResponseSchema,
  EmptyResponseSchema,
  NotificationListResponseSchema,
  NotificationResponseSchema,
  PaginationQuerySchema,
  PreferencesResponseSchema,
  RegisterDeviceSchema,
  UnreadCountResponseSchema,
  UpdatePreferencesSchema,
} from "@repo/contracts";
import { MarkReadCommand } from "../../application/commands/mark-read.command";
import { UpdatePreferencesCommand } from "../../application/commands/update-preferences.command";
import { RegisterDeviceTokenCommand } from "../../application/commands/register-device-token.command";
import { ListNotificationsQuery } from "../../application/queries/list-notifications.query";
import { GetPreferencesQuery } from "../../application/queries/get-preferences.query";
import { toNotificationResponse } from "../mappers/notifications.mapper";
import {
  DEVICE_ERRORS,
  NOTIFICATION_ERRORS,
  PREFERENCE_ERRORS,
} from "../error-maps/notifications.error-maps";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { handleResult } from "../../../../common/utils/presentation.utils";

@Controller("notifications")
@TenantAgnostic()
export class NotificationsController {
  constructor(
    private readonly markReadCmd: MarkReadCommand,
    private readonly updatePreferencesCmd: UpdatePreferencesCommand,
    private readonly registerDeviceCmd: RegisterDeviceTokenCommand,
    private readonly listQuery: ListNotificationsQuery,
    private readonly preferencesQuery: GetPreferencesQuery,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @RequirePermission("notifications:read")
  @ResponseSchema(NotificationListResponseSchema)
  async list(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @Req() req: FastifyRequest,
  ): Promise<NotificationListResponse> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.listQuery.execute(
      actor,
      Number(query.page ?? 1),
      Number(query.limit ?? 20),
    );
    const page = handleResult(
      result,
      NOTIFICATION_ERRORS,
      this.i18n,
      req?.headers["accept-language"],
    );
    return {
      items: page.items.map(toNotificationResponse),
      total: page.total,
      page: page.page,
      limit: page.limit,
      totalPages: page.totalPages,
    };
  }

  @Get("unread-count")
  @RequirePermission("notifications:read")
  @ResponseSchema(UnreadCountResponseSchema)
  async unreadCount(@Req() req: FastifyRequest): Promise<UnreadCountResponse> {
    const actor = requireAuthenticatedUser(req);
    return { count: await this.listQuery.unreadCount(actor.sub) };
  }

  @Patch(":id/read")
  @Idempotent()
  @RequirePermission("notifications:write")
  @ResponseSchema(NotificationResponseSchema)
  async markOneRead(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Req() req: FastifyRequest,
  ): Promise<NotificationResponse> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.markReadCmd.execute(id, actor.sub);
    const notification = handleResult(
      result,
      NOTIFICATION_ERRORS,
      this.i18n,
      req?.headers["accept-language"],
    );
    return toNotificationResponse(notification);
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @RequirePermission("notifications:write")
  @ResponseSchema(EmptyResponseSchema)
  async markAllRead(@Req() req: FastifyRequest): Promise<void> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.markReadCmd.markAllRead(actor.sub);
    handleResult(result, NOTIFICATION_ERRORS, this.i18n, req?.headers["accept-language"]);
  }

  @Get("preferences")
  @RequirePermission("notifications:read")
  @ResponseSchema(PreferencesResponseSchema)
  async getPreferences(@Req() req: FastifyRequest): Promise<PreferencesResponse> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.preferencesQuery.execute(actor.sub);
    const preferences = handleResult(
      result,
      PREFERENCE_ERRORS,
      this.i18n,
      req?.headers["accept-language"],
    );
    return { preferences };
  }

  @Put("preferences")
  @Idempotent()
  @RequirePermission("notifications:write")
  @ResponseSchema(PreferencesResponseSchema)
  async putPreferences(
    @Body(new ZodValidationPipe(UpdatePreferencesSchema)) body: UpdatePreferencesInput,
    @Req() req: FastifyRequest,
  ): Promise<PreferencesResponse> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.updatePreferencesCmd.execute(actor.sub, body.preferences);
    const preferences = handleResult(
      result,
      PREFERENCE_ERRORS,
      this.i18n,
      req?.headers["accept-language"],
    );
    return { preferences };
  }

  @Post("devices")
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("notifications:write")
  @ResponseSchema(DeviceResponseSchema)
  async addDevice(
    @Body(new ZodValidationPipe(RegisterDeviceSchema)) body: RegisterDeviceInput,
    @Req() req: FastifyRequest,
  ): Promise<DeviceResponse> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.registerDeviceCmd.execute(actor.sub, body);
    const device = handleResult(result, DEVICE_ERRORS, this.i18n, req?.headers["accept-language"]);
    return {
      id: device.id,
      platform: device.platform,
      provider: device.provider,
      createdAt: device.createdAt.toISOString(),
    };
  }

  @Delete("devices/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent()
  @RequirePermission("notifications:write")
  @ResponseSchema(EmptyResponseSchema)
  async deleteDevice(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.registerDeviceCmd.deleteDevice(actor.sub, id);
    handleResult(result, DEVICE_ERRORS, this.i18n, req?.headers["accept-language"]);
  }
}
