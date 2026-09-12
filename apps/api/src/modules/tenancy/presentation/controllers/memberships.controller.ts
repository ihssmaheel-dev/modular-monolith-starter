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
import {
  Idempotent,
  RequirePermission,
  TenantAgnostic,
  requireAuthenticatedUser,
  ResponseSchema,
} from "../../../../common";
import {
  type AcceptInvitationInput,
  type InviteMemberInput,
  type UpdateMemberInput,
  type PaginationQuery,
  type MemberResponse,
  type MemberListResponse,
  type InvitationResponse,
  type InvitationListResponse,
} from "@repo/contracts";
import {
  AcceptInvitationSchema,
  InviteMemberSchema,
  UpdateMemberSchema,
  PaginationQuerySchema,
  MemberListResponseSchema,
  MemberResponseSchema,
  InvitationResponseSchema,
  InvitationListResponseSchema,
  EmptyResponseSchema,
} from "@repo/contracts";
import { ZodValidationPipe } from "../../../../common/pipes/validation.pipe";
import { z } from "zod";
import { handleResult } from "../../../../common/utils/presentation.utils";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { AcceptInvitationCommand } from "../../application/commands/accept-invitation.command";
import { InviteMemberCommand } from "../../application/commands/invite-member.command";
import { RemoveMemberCommand } from "../../application/commands/remove-member.command";
import { UpdateMemberCommand } from "../../application/commands/update-member.command";
import { ListInvitationsQuery } from "../../application/queries/list-invitations.query";
import { ListMembersQuery } from "../../application/queries/list-members.query";
import { INVITATION_ERRORS, MEMBERSHIP_ERRORS } from "../error-maps/tenancy.error-maps";
import { toInvitationResponse, toMemberResponse } from "../mappers/tenancy.mapper";

@Controller("tenancy")
export class MembershipsController {
  constructor(
    private readonly listMembers: ListMembersQuery,
    private readonly updateMember: UpdateMemberCommand,
    private readonly removeMember: RemoveMemberCommand,
    private readonly inviteMember: InviteMemberCommand,
    private readonly listInvitations: ListInvitationsQuery,
    private readonly acceptInvitation: AcceptInvitationCommand,
    private readonly i18n: I18nService,
  ) {}

  @Get("members")
  @RequirePermission("team:read")
  @ResponseSchema(MemberListResponseSchema)
  async listMemberPage(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @Req() request: FastifyRequest,
  ): Promise<MemberListResponse> {
    const result = await this.listMembers.execute(
      Number(query.page ?? 1),
      Number(query.limit ?? 20),
    );
    const value = this.handle(result, MEMBERSHIP_ERRORS, request);
    return { ...value, items: value.items.map(toMemberResponse) };
  }

  @Patch("members/:userId")
  @Idempotent()
  @RequirePermission("team:manage")
  @ResponseSchema(MemberResponseSchema)
  async update(
    @Param("userId", new ZodValidationPipe(z.string().min(1))) userId: string,
    @Body(new ZodValidationPipe(UpdateMemberSchema)) body: UpdateMemberInput,
    @Req() request: FastifyRequest,
  ): Promise<MemberResponse> {
    const result = await this.updateMember.execute(userId, body.role);
    return toMemberResponse(this.handle(result, MEMBERSHIP_ERRORS, request));
  }

  @Delete("members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent()
  @RequirePermission("team:remove")
  @ResponseSchema(EmptyResponseSchema)
  async remove(
    @Param("userId", new ZodValidationPipe(z.string().min(1))) userId: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    this.handle(await this.removeMember.execute(userId), MEMBERSHIP_ERRORS, request);
  }

  @Post("invitations")
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("team:invite")
  @ResponseSchema(InvitationResponseSchema)
  async invite(
    @Body(new ZodValidationPipe(InviteMemberSchema)) body: InviteMemberInput,
    @Req() request: FastifyRequest,
  ): Promise<InvitationResponse> {
    const actor = requireAuthenticatedUser(request);
    const locale = this.i18n.getLocale(request.headers["accept-language"]);
    const result = await this.inviteMember.execute(body, actor, locale);
    return toInvitationResponse(this.handle(result, INVITATION_ERRORS, request));
  }

  @Get("invitations")
  @RequirePermission("team:read")
  @ResponseSchema(InvitationListResponseSchema)
  async listInvitationPage(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @Req() request: FastifyRequest,
  ): Promise<InvitationListResponse> {
    const value = this.handle(
      await this.listInvitations.execute(Number(query.page ?? 1), Number(query.limit ?? 20)),
      INVITATION_ERRORS,
      request,
    );
    return { ...value, items: value.items.map(toInvitationResponse) };
  }

  @Post("invitations/accept")
  @HttpCode(HttpStatus.OK)
  @TenantAgnostic()
  @Idempotent()
  @ResponseSchema(MemberResponseSchema)
  async accept(
    @Body(new ZodValidationPipe(AcceptInvitationSchema)) body: AcceptInvitationInput,
    @Req() request: FastifyRequest,
  ): Promise<MemberResponse> {
    const actor = requireAuthenticatedUser(request);
    const value = this.handle(
      await this.acceptInvitation.execute(body.token, actor),
      INVITATION_ERRORS,
      request,
    );
    return toMemberResponse(value);
  }

  private handle<T>(
    result: Parameters<typeof handleResult<T, unknown>>[0],
    errors: Parameters<typeof handleResult>[1],
    request: FastifyRequest,
  ): T {
    return handleResult(result, errors, this.i18n, request.headers["accept-language"]);
  }
}
