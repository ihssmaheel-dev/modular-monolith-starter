import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Permissions } from "@repo/authorization";
import {
  type SearchDocumentResult,
  SearchDocumentsRequestSchema,
  type SearchDocumentsRequest,
  SearchDocumentsResponseSchema,
  UnaryChatRequestSchema,
  type UnaryChatRequest,
  UnaryChatResponseSchema,
  type UnaryChatResponse,
} from "@repo/contracts";
import {
  NoDatabaseTransaction,
  RequirePermission,
  requireAuthenticatedUser,
  resolveRequestId,
  ResponseSchema,
} from "../../../../common";
import { ZodValidationPipe } from "../../../../common/pipes/validation.pipe";
import { handleResult } from "../../../../common/utils/presentation.utils";
import { TenantContextService } from "../../../../infrastructure/database";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { ExecuteUnaryChatCommand } from "../../application/commands/execute-unary-chat.command";
import { SearchIntelligenceDocumentsQuery } from "../../application/queries/search-intelligence-documents.query";
import { INTELLIGENCE_ERRORS } from "../error-maps/intelligence.error-maps";
import { toSearchDocumentsResponse, toUnaryChatResponse } from "../mappers/intelligence.mapper";

@Controller("intelligence")
export class IntelligenceController {
  constructor(
    private readonly executeUnaryChatCommand: ExecuteUnaryChatCommand,
    private readonly searchDocumentsQuery: SearchIntelligenceDocumentsQuery,
    private readonly tenantContext: TenantContextService,
    private readonly i18n: I18nService,
  ) {}

  @Post("chat")
  @HttpCode(HttpStatus.OK)
  @NoDatabaseTransaction()
  @RequirePermission(Permissions.AI_INTERACT)
  @ResponseSchema(UnaryChatResponseSchema)
  async chat(
    @Body(new ZodValidationPipe(UnaryChatRequestSchema)) body: UnaryChatRequest,
    @Req() req: FastifyRequest,
  ): Promise<UnaryChatResponse> {
    const actor = requireAuthenticatedUser(req);
    const requestId = resolveRequestId(req.headers["x-request-id"]);
    const lang = req.headers["accept-language"];
    const tenantCtx = this.tenantContext.get();
    if (tenantCtx.mode === "multi" && !tenantCtx.tenantId) {
      throw new BadRequestException(this.i18n.t("api.tenancy.tenantRequired", lang));
    }
    const tenantId = tenantCtx.tenantId;

    const result = await this.executeUnaryChatCommand.execute(body, {
      tenantId,
      actor,
      requestId,
    });
    const val = handleResult(result, INTELLIGENCE_ERRORS, this.i18n, lang);
    return toUnaryChatResponse(val);
  }

  @Post("search")
  @HttpCode(HttpStatus.OK)
  @NoDatabaseTransaction()
  @RequirePermission(Permissions.AI_INTERACT)
  @ResponseSchema(SearchDocumentsResponseSchema)
  async search(
    @Body(new ZodValidationPipe(SearchDocumentsRequestSchema)) body: SearchDocumentsRequest,
    @Req() req: FastifyRequest,
  ): Promise<SearchDocumentResult[]> {
    const actor = requireAuthenticatedUser(req);
    const requestId = resolveRequestId(req.headers["x-request-id"]);
    const lang = req.headers["accept-language"];
    const tenantCtx = this.tenantContext.get();
    if (tenantCtx.mode === "multi" && !tenantCtx.tenantId) {
      throw new BadRequestException(this.i18n.t("api.tenancy.tenantRequired", lang));
    }
    const tenantId = tenantCtx.tenantId;

    const result = await this.searchDocumentsQuery.execute(body, tenantId, {
      actor,
      requestId,
    });
    const val = handleResult(result, INTELLIGENCE_ERRORS, this.i18n, lang);
    return toSearchDocumentsResponse(val);
  }
}
