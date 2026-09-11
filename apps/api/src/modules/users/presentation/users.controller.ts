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
} from "../../../common";
import { ZodValidationPipe } from "../../../common/pipes/validation.pipe";
import {
  type AttachAvatarInput,
  type CreateUserInput,
  type UpdateUserInput,
  type PaginationQuery,
  type UserResponse,
  type UserListResponse,
  AttachAvatarSchema,
  CreateUserSchema,
  UpdateUserSchema,
  PaginationQuerySchema,
  UserListResponseSchema,
  UserResponseSchema,
  EmptyResponseSchema,
} from "@repo/contracts";
import { GetUsersQuery } from "../application/queries/get-users.query";
import { GetUserByIdQuery } from "../application/queries/get-user-by-id.query";
import { CreateUserCommand } from "../application/commands/create-user.command";
import { UpdateUserCommand } from "../application/commands/update-user.command";
import { DeleteUserCommand } from "../application/commands/delete-user.command";
import { AttachUserAvatarCommand } from "../application/commands/attach-user-avatar.command";
import { RemoveUserAvatarCommand } from "../application/commands/remove-user-avatar.command";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import { handleResult } from "../../../common/utils/presentation.utils";
import { toUserResponse } from "./users.mapper";
import { AVATAR_ERRORS } from "./users.error-maps";

@Controller("users")
@TenantAgnostic()
export class UsersController {
  constructor(
    private readonly getUsersQuery: GetUsersQuery,
    private readonly getUserByIdQuery: GetUserByIdQuery,
    private readonly createUserCommand: CreateUserCommand,
    private readonly updateUserCommand: UpdateUserCommand,
    private readonly deleteUserCommand: DeleteUserCommand,
    private readonly attachAvatarCommand: AttachUserAvatarCommand,
    private readonly removeAvatarCommand: RemoveUserAvatarCommand,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @RequirePermission("users:read")
  @ResponseSchema(UserListResponseSchema)
  async list(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @Req() req: FastifyRequest,
  ): Promise<UserListResponse> {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const lang = req?.headers["accept-language"];
    const result = await this.getUsersQuery.execute(page, limit);
    const val = handleResult(result, {}, this.i18n, lang);
    const { users, total, page: p, limit: l, totalPages } = val;
    return { users: users.map(toUserResponse), total, page: p, limit: l, totalPages };
  }

  @Get(":id")
  @RequirePermission("users:read")
  @ResponseSchema(UserResponseSchema)
  async getById(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Req() req: FastifyRequest,
  ): Promise<UserResponse> {
    const lang = req?.headers["accept-language"];
    const result = await this.getUserByIdQuery.execute(id);
    const user = handleResult(
      result,
      {
        USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
      },
      this.i18n,
      lang,
    );
    return toUserResponse(user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("users:write")
  @ResponseSchema(UserResponseSchema)
  async create(
    @Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUserInput,
    @Req() req: FastifyRequest,
  ): Promise<UserResponse> {
    const lang = req?.headers["accept-language"];
    const locale = this.i18n.getLocale(req.headers["accept-language"]);
    const result = await this.createUserCommand.execute(body, locale);
    const user = handleResult(
      result,
      {
        EMAIL_TAKEN: { status: HttpStatus.CONFLICT, i18nKey: "api.user.emailTaken" },
        USER_EVENT_DISPATCH_FAILED: {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          i18nKey: "api.error.eventDispatchFailed",
        },
        TRANSACTION_FAILED: {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          i18nKey: "api.error.transactionFailed",
        },
      },
      this.i18n,
      lang,
    );
    return toUserResponse(user);
  }

  @Patch("me")
  @Idempotent()
  @ResponseSchema(UserResponseSchema)
  async updateMe(
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUserInput,
    @Req() req: FastifyRequest,
  ): Promise<UserResponse> {
    // No permission decorator: any authenticated user may edit their own
    // profile. Self-scope is enforced inside UpdateUserCommand (name only).
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.updateUserCommand.execute(actor.sub, body, actor);
    const user = handleResult(
      result,
      {
        USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
        EMAIL_TAKEN: { status: HttpStatus.CONFLICT, i18nKey: "api.user.emailTaken" },
        USER_FORBIDDEN: { status: HttpStatus.FORBIDDEN, i18nKey: "api.error.forbidden" },
      },
      this.i18n,
      lang,
    );
    return toUserResponse(user);
  }

  @Patch(":id")
  @Idempotent()
  @RequirePermission("users:write")
  @ResponseSchema(UserResponseSchema)
  async update(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUserInput,
    @Req() req: FastifyRequest,
  ): Promise<UserResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.updateUserCommand.execute(id, body, actor);
    const user = handleResult(
      result,
      {
        USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
        EMAIL_TAKEN: { status: HttpStatus.CONFLICT, i18nKey: "api.user.emailTaken" },
        USER_FORBIDDEN: { status: HttpStatus.FORBIDDEN, i18nKey: "api.error.forbidden" },
      },
      this.i18n,
      lang,
    );
    return toUserResponse(user);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent()
  @RequirePermission("users:delete")
  @ResponseSchema(EmptyResponseSchema)
  async delete(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    const lang = req?.headers["accept-language"];
    const result = await this.deleteUserCommand.execute(id);
    handleResult(
      result,
      {
        USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, i18nKey: "api.user.notFound" },
        USER_OWNS_ORGANIZATION: {
          status: HttpStatus.CONFLICT,
          i18nKey: "api.user.ownsOrganization",
        },
        USER_EVENT_DISPATCH_FAILED: {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          i18nKey: "api.error.eventDispatchFailed",
        },
      },
      this.i18n,
      lang,
    );
  }

  @Post("me/avatar")
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("users:write")
  @ResponseSchema(UserResponseSchema)
  async attachAvatar(
    @Body(new ZodValidationPipe(AttachAvatarSchema)) body: AttachAvatarInput,
    @Req() req: FastifyRequest,
  ): Promise<UserResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.attachAvatarCommand.execute(actor, body.fileId);
    const user = handleResult(result, AVATAR_ERRORS, this.i18n, lang);
    return toUserResponse(user);
  }

  @Delete("me/avatar")
  @Idempotent()
  @RequirePermission("users:write")
  @ResponseSchema(UserResponseSchema)
  async removeAvatar(@Req() req: FastifyRequest): Promise<UserResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.removeAvatarCommand.execute(actor);
    const user = handleResult(result, AVATAR_ERRORS, this.i18n, lang);
    return toUserResponse(user);
  }
}
