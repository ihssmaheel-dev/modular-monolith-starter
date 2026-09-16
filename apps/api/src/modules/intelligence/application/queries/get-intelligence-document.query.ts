import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { TenantContextService } from "../../../../infrastructure/database";
import { IntelligenceDocumentRepository } from "../../infrastructure/repositories/intelligence.repository";
import type { IntelligenceDocumentEntity } from "../../domain/entities/intelligence-document.entity";
import type { IntelligenceError } from "../../domain/errors/intelligence.errors";

@Injectable()
export class GetIntelligenceDocumentQuery {
  constructor(
    private readonly documents: IntelligenceDocumentRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    id: string,
    _actor: AuthenticatedUser,
  ): Promise<Result<IntelligenceDocumentEntity, IntelligenceError>> {
    const result = await this.documents.findById(id);
    const tenantId = this.tenantContext.getRequiredTenantId() ?? "single-tenant";
    if (result.isErr() || !result.value || result.value.tenantId !== tenantId) {
      return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
    }
    return ok(result.value);
  }
}
