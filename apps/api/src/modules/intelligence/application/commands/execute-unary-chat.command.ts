import { Injectable } from "@nestjs/common";
import { err, Result } from "neverthrow";
import type { AuthenticatedUser, UnaryChatRequest, UnaryChatResponse } from "@repo/contracts";
import { env } from "../../../../config/env";
import {
  IntelligenceDisabledError,
  type IntelligenceError,
} from "../../domain/errors/intelligence.errors";
import { IntelligenceGatewayService } from "../services/intelligence-gateway.service";

@Injectable()
export class ExecuteUnaryChatCommand {
  constructor(private readonly gateway: IntelligenceGatewayService) {}

  async execute(
    request: UnaryChatRequest,
    options?: {
      tenantId?: string;
      actor?: AuthenticatedUser;
      requestId?: string;
    },
  ): Promise<Result<UnaryChatResponse, IntelligenceError>> {
    if (!env.INTELLIGENCE_ENABLED) {
      return err(new IntelligenceDisabledError());
    }
    return this.gateway.executeUnaryChat(request, options);
  }
}
