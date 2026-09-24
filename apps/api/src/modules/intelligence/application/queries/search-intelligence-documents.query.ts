import { Injectable } from "@nestjs/common";
import { err, Result } from "neverthrow";
import type {
  AuthenticatedUser,
  SearchDocumentResult,
  SearchDocumentsRequest,
} from "@repo/contracts";
import { env } from "../../../../config/env";
import {
  IntelligenceDisabledError,
  type IntelligenceError,
} from "../../domain/errors/intelligence.errors";
import { IntelligenceGatewayService } from "../services/intelligence-gateway.service";

@Injectable()
export class SearchIntelligenceDocumentsQuery {
  constructor(private readonly gateway: IntelligenceGatewayService) {}

  async execute(
    request: SearchDocumentsRequest,
    tenantId?: string,
    options?: {
      actor?: AuthenticatedUser;
      requestId?: string;
    },
  ): Promise<Result<SearchDocumentResult[], IntelligenceError>> {
    if (!env.INTELLIGENCE_ENABLED) {
      return err(new IntelligenceDisabledError());
    }
    return this.gateway.searchDocuments(request, tenantId, options);
  }
}
