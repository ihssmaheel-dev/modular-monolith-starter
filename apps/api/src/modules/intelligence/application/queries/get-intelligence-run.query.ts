import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { TenantContextService } from "../../../../infrastructure/database";
import { IntelligencePromptProtector } from "../../infrastructure/security/prompt-protector";
import { IntelligenceRunRepository } from "../../infrastructure/repositories/intelligence.repository";
import type { IntelligenceRunEntity } from "../../domain/entities/intelligence-run.entity";
import type { IntelligenceError } from "../../domain/errors/intelligence.errors";

export interface PublicIntelligenceRun extends Omit<IntelligenceRunEntity, "resultCiphertext"> {
  result: string | null;
}

@Injectable()
export class GetIntelligenceRunQuery {
  constructor(
    private readonly runs: IntelligenceRunRepository,
    private readonly tenantContext: TenantContextService,
    private readonly protector: IntelligencePromptProtector,
  ) {}

  async execute(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<Result<PublicIntelligenceRun, IntelligenceError>> {
    const result = await this.runs.findById(id);
    if (result.isErr() || !result.value) return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
    const run = result.value;
    const tenantId = this.tenantContext.getRequiredTenantId() ?? "single-tenant";
    if (run.tenantId !== tenantId || run.requestedBy !== actor.sub) {
      return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
    }
    let output: string | null = null;
    if (run.resultCiphertext) {
      try {
        output = this.protector.decrypt(run.resultCiphertext);
      } catch {
        return err({ type: "INTELLIGENCE_INVALID_RESPONSE" });
      }
    }
    return ok({ ...run, result: output });
  }
}
