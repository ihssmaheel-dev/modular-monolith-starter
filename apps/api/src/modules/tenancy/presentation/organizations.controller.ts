import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  Idempotent,
  TenantAgnostic,
  requireAuthenticatedUser,
  ResponseSchema,
} from "../../../common";
import { ZodValidationPipe } from "../../../common/pipes/validation.pipe";
import {
  type CreateOrganizationInput,
  type PaginationQuery,
  type OrganizationResponse,
  type OrganizationListResponse,
  CreateOrganizationSchema,
  PaginationQuerySchema,
  OrganizationResponseSchema,
  OrganizationListResponseSchema,
} from "@repo/contracts";
import { handleResult } from "../../../common/utils/presentation.utils";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import { CreateOrganizationCommand } from "../application/commands/create-organization.command";
import { ListOrganizationsQuery } from "../application/queries/list-organizations.query";
import { ORGANIZATION_ERRORS } from "./tenancy.error-maps";
import { toOrganizationResponse } from "./tenancy.mapper";

@Controller("tenancy")
@TenantAgnostic()
// allow-authenticated-only-routes — every authenticated user may found an
// organization; listing is membership-scoped inside ListOrganizationsQuery.
// Adding @RequirePermission here would lock out non-admin users because the
// global user role carries no organization permissions by design.
export class OrganizationsController {
  constructor(
    private readonly createOrganization: CreateOrganizationCommand,
    private readonly listOrganizations: ListOrganizationsQuery,
    private readonly i18n: I18nService,
  ) {}

  @Post("organizations")
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @ResponseSchema(OrganizationResponseSchema)
  async create(
    @Body(new ZodValidationPipe(CreateOrganizationSchema)) body: CreateOrganizationInput,
    @Req() request: FastifyRequest,
  ): Promise<OrganizationResponse> {
    const actor = requireAuthenticatedUser(request);
    const result = await this.createOrganization.execute(body, actor);
    const value = handleResult(
      result,
      ORGANIZATION_ERRORS,
      this.i18n,
      request.headers["accept-language"],
    );
    return toOrganizationResponse(value.organization, value.membership.data.role);
  }

  @Get("organizations")
  @ResponseSchema(OrganizationListResponseSchema)
  async list(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @Req() request: FastifyRequest,
  ): Promise<OrganizationListResponse> {
    const actor = requireAuthenticatedUser(request);
    const result = await this.listOrganizations.execute(
      actor,
      Number(query.page ?? 1),
      Number(query.limit ?? 20),
    );
    const value = handleResult(result, {}, this.i18n, request.headers["accept-language"]);
    return {
      ...value,
      items: value.items.map(({ organization, role }) =>
        toOrganizationResponse(organization, role),
      ),
    };
  }
}
