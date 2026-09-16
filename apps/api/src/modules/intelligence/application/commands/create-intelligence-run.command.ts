import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser, CreateIntelligenceRunInput } from "@repo/contracts";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { IntelligencePromptProtector } from "../../infrastructure/security/prompt-protector";
import { IntelligenceRunRepository } from "../../infrastructure/repositories/intelligence.repository";
import type { IntelligenceError } from "../../domain/errors/intelligence.errors";
import type { IntelligenceRunEntity } from "../../domain/entities/intelligence-run.entity";
import { INTELLIGENCE_RUN_JOB_PREFIX, INTELLIGENCE_RUN_QUEUE } from "../intelligence.constants";

interface IntelligenceRunJob {
  runId: string;
  tenantId: string;
}

@Injectable()
export class CreateIntelligenceRunCommand {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly runs: IntelligenceRunRepository,
    private readonly queue: QueueService,
    private readonly protector: IntelligencePromptProtector,
  ) {}

  async execute(
    input: CreateIntelligenceRunInput,
    actor: AuthenticatedUser,
  ): Promise<Result<IntelligenceRunEntity, IntelligenceError>> {
    if (!env.INTELLIGENCE_ENABLED) return err({ type: "INTELLIGENCE_DISABLED" });
    if (!env.REDIS_URL) return err({ type: "INTELLIGENCE_UNAVAILABLE" });
    const tenantId = this.tenantContext.getRequiredTenantId() ?? "single-tenant";
    const id = crypto.randomUUID();
    const created = await this.database.runTransaction(() =>
      this.runs.create({
        id,
        tenantId,
        requestedBy: actor.sub,
        status: "QUEUED",
        promptCiphertext: this.protector.encrypt(input.prompt),
        outputSchema: input.outputSchema ?? null,
        documentIds: input.documentIds,
        maxOutputTokens: input.maxOutputTokens,
        citations: [],
      }),
    );
    if (created.isErr()) return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
    const queue = this.queue.getQueue<IntelligenceRunJob>(INTELLIGENCE_RUN_QUEUE);
    if (!queue) return err({ type: "INTELLIGENCE_UNAVAILABLE" });
    try {
      await queue.add(
        "generate",
        { runId: id, tenantId },
        { jobId: `${INTELLIGENCE_RUN_JOB_PREFIX}${id}`, removeOnComplete: 100, removeOnFail: 1000 },
      );
    } catch {
      return err({ type: "INTELLIGENCE_UNAVAILABLE" });
    }
    const loaded = await this.runs.findById(created.value.id);
    if (loaded.isErr() || !loaded.value) return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
    return ok(loaded.value);
  }
}
