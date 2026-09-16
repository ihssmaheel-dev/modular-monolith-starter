import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  CreateIntelligenceRunSchema,
  IntelligenceRunIdParamSchema,
  type CreateIntelligenceRunInput,
  type IntelligenceRunResponse,
  type IntelligenceDocumentStatus,
  IntelligenceDocumentStatusSchema,
  IntelligenceRunResponseSchema,
} from "@repo/contracts";
import {
  Idempotent,
  NoDatabaseTransaction,
  RateLimit,
  RequirePermission,
  ResponseSchema,
  requireAuthenticatedUser,
} from "../../../../common";
import { ZodValidationPipe } from "../../../../common/pipes/validation.pipe";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";
import { handleResult } from "../../../../common/utils/presentation.utils";
import { CreateIntelligenceRunCommand } from "../../application/commands/create-intelligence-run.command";
import { GetIntelligenceRunQuery } from "../../application/queries/get-intelligence-run.query";
import { IndexIntelligenceDocumentCommand } from "../../application/commands/index-intelligence-document.command";
import { GetIntelligenceDocumentQuery } from "../../application/queries/get-intelligence-document.query";
import {
  toIntelligenceDocumentResponse,
  toIntelligenceRunResponse,
} from "../mappers/intelligence.mapper";
import { INTELLIGENCE_ERRORS } from "../error-maps/intelligence.error-maps";

@Controller("intelligence")
export class IntelligenceController {
  constructor(
    private readonly createRun: CreateIntelligenceRunCommand,
    private readonly getRun: GetIntelligenceRunQuery,
    private readonly indexDocument: IndexIntelligenceDocumentCommand,
    private readonly getDocument: GetIntelligenceDocumentQuery,
    private readonly i18n: I18nService,
  ) {}

  @Post("runs")
  @HttpCode(HttpStatus.ACCEPTED)
  @NoDatabaseTransaction()
  @Idempotent()
  @RateLimit(10, 60)
  @RequirePermission("intelligence:run")
  @ResponseSchema(IntelligenceRunResponseSchema)
  async create(
    @Body(new ZodValidationPipe(CreateIntelligenceRunSchema)) body: CreateIntelligenceRunInput,
    @Req() request: FastifyRequest,
  ): Promise<IntelligenceRunResponse> {
    const result = await this.createRun.execute(body, requireAuthenticatedUser(request));
    const run = handleResult(
      result,
      INTELLIGENCE_ERRORS,
      this.i18n,
      request.headers["accept-language"],
    );
    return toIntelligenceRunResponse({ ...run, result: null });
  }

  @Get("runs/:id")
  @RateLimit(60, 60)
  @RequirePermission("intelligence:run")
  async get(
    @Param("id", new ZodValidationPipe(IntelligenceRunIdParamSchema.shape.id)) id: string,
    @Req() request: FastifyRequest,
  ): Promise<IntelligenceRunResponse> {
    const result = await this.getRun.execute(id, requireAuthenticatedUser(request));
    const run = handleResult(
      result,
      INTELLIGENCE_ERRORS,
      this.i18n,
      request.headers["accept-language"],
    );
    return toIntelligenceRunResponse(run);
  }

  @Post("documents/:id/index")
  @HttpCode(HttpStatus.ACCEPTED)
  @NoDatabaseTransaction()
  @Idempotent()
  @RateLimit(10, 60)
  @RequirePermission("intelligence:index")
  @ResponseSchema(IntelligenceDocumentStatusSchema)
  async index(
    @Param("id", new ZodValidationPipe(IntelligenceRunIdParamSchema.shape.id)) fileId: string,
    @Req() request: FastifyRequest,
  ): Promise<IntelligenceDocumentStatus> {
    const result = await this.indexDocument.execute(fileId, requireAuthenticatedUser(request));
    const document = handleResult(
      result,
      INTELLIGENCE_ERRORS,
      this.i18n,
      request.headers["accept-language"],
    );
    return toIntelligenceDocumentResponse(document);
  }

  @Get("documents/:id/status")
  @RateLimit(60, 60)
  @RequirePermission("intelligence:index")
  async status(
    @Param("id", new ZodValidationPipe(IntelligenceRunIdParamSchema.shape.id)) id: string,
    @Req() request: FastifyRequest,
  ): Promise<IntelligenceDocumentStatus> {
    const result = await this.getDocument.execute(id, requireAuthenticatedUser(request));
    const document = handleResult(
      result,
      INTELLIGENCE_ERRORS,
      this.i18n,
      request.headers["accept-language"],
    );
    return toIntelligenceDocumentResponse(document);
  }
}
