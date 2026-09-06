import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  type DsrListResponse,
  type DsrResponse,
  type ExportDownloadResponse,
  type PaginationQuery,
  DsrListResponseSchema,
  DsrResponseSchema,
  ExportDownloadResponseSchema,
  PaginationQuerySchema,
  RequestAccountErasureSchema,
  RequestOrganizationErasureSchema,
  EmptyResponseSchema,
} from "@repo/contracts";
import { RequestExportCommand } from "../application/commands/request-export.command";
import { RequestAccountErasureCommand } from "../application/commands/request-account-erasure.command";
import { RequestOrganizationErasureCommand } from "../application/commands/request-organization-erasure.command";
import { PurgeExpiredErasuresCommand } from "../application/commands/purge-expired-erasures.command";
import { DownloadExportQuery } from "../application/queries/download-export.query";
import { ListRequestsQuery } from "../application/queries/list-requests.query";
import { toDsrResponse } from "./privacy.mapper";
import { EXPORT_ERRORS, ERASURE_ERRORS } from "./privacy.error-maps";
import { I18nService } from "../../../infrastructure/i18n/i18n.service";
import { handleResult } from "../../../common/utils/presentation.utils";

const ConfirmationSchema = RequestOrganizationErasureSchema.pick({ confirmationName: true });

@Controller("privacy")
@TenantAgnostic()
export class PrivacyController {
  constructor(
    private readonly requestExport: RequestExportCommand,
    private readonly downloadExport: DownloadExportQuery,
    private readonly listRequests: ListRequestsQuery,
    private readonly requestAccountErasure: RequestAccountErasureCommand,
    private readonly requestOrganizationErasure: RequestOrganizationErasureCommand,
    private readonly purgeExpired: PurgeExpiredErasuresCommand,
    private readonly i18n: I18nService,
  ) {}

  @Post("export")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("privacy:export:self")
  @ResponseSchema(DsrResponseSchema)
  async export(@Req() req: FastifyRequest): Promise<DsrResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.requestExport.execute(actor);
    const request = handleResult(result, EXPORT_ERRORS, this.i18n, lang);
    return toDsrResponse(request);
  }

  @Get("export/:id/download")
  @RequirePermission("privacy:export:self")
  @ResponseSchema(ExportDownloadResponseSchema)
  async download(
    @Param("id", new ZodValidationPipe(z.string().min(1))) id: string,
    @Req() req: FastifyRequest,
  ): Promise<ExportDownloadResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.downloadExport.execute(id, actor);
    return handleResult(result, EXPORT_ERRORS, this.i18n, lang);
  }

  @Get("requests")
  @RequirePermission("privacy:export:self")
  @ResponseSchema(DsrListResponseSchema)
  async listMine(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @Req() req: FastifyRequest,
  ): Promise<DsrListResponse> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.listRequests.execute(
      actor,
      Number(query.page ?? 1),
      Number(query.limit ?? 20),
      "mine",
    );
    const lang = req?.headers["accept-language"];
    return handleResult(result, EXPORT_ERRORS, this.i18n, lang);
  }

  @Post("erase-account")
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("privacy:erase:self")
  @ResponseSchema(DsrResponseSchema)
  async eraseAccount(
    @Body(new ZodValidationPipe(RequestAccountErasureSchema))
    body: z.infer<typeof RequestAccountErasureSchema>,
    @Req() req: FastifyRequest,
  ): Promise<DsrResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.requestAccountErasure.execute(actor, body.password);
    const request = handleResult(result, ERASURE_ERRORS, this.i18n, lang);
    return toDsrResponse(request);
  }

  @Post("organizations/:organizationId/erase")
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @RequirePermission("privacy:erase:tenant")
  @ResponseSchema(DsrResponseSchema)
  async eraseOrganization(
    @Param("organizationId", new ZodValidationPipe(z.string().min(1))) organizationId: string,
    @Body(new ZodValidationPipe(ConfirmationSchema))
    body: z.infer<typeof ConfirmationSchema>,
    @Req() req: FastifyRequest,
  ): Promise<DsrResponse> {
    const lang = req?.headers["accept-language"];
    const actor = requireAuthenticatedUser(req);
    const result = await this.requestOrganizationErasure.execute(
      actor,
      organizationId,
      body.confirmationName,
    );
    const request = handleResult(result, ERASURE_ERRORS, this.i18n, lang);
    return toDsrResponse(request);
  }

  @Get("admin/requests")
  @RequirePermission("privacy:requests:read")
  @ResponseSchema(DsrListResponseSchema)
  async listAll(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @Req() req: FastifyRequest,
  ): Promise<DsrListResponse> {
    const actor = requireAuthenticatedUser(req);
    const result = await this.listRequests.execute(
      actor,
      Number(query.page ?? 1),
      Number(query.limit ?? 20),
      "all",
    );
    const lang = req?.headers["accept-language"];
    return handleResult(result, EXPORT_ERRORS, this.i18n, lang);
  }

  @Post("admin/purge-expired")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("privacy:requests:read")
  @ResponseSchema(EmptyResponseSchema)
  async purge(@Req() req: FastifyRequest): Promise<void> {
    const lang = req?.headers["accept-language"];
    requireAuthenticatedUser(req);
    const result = await this.purgeExpired.execute();
    handleResult(result, ERASURE_ERRORS, this.i18n, lang);
  }
}
