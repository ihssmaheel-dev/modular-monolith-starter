import { Injectable, OnModuleInit } from "@nestjs/common";
import type { Job } from "bullmq";
import { err, ok, type Result } from "neverthrow";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { IntelligenceClient } from "../../infrastructure/clients/intelligence.client";
import { IntelligencePromptProtector } from "../../infrastructure/security/prompt-protector";
import {
  IntelligenceChunkRepository,
  IntelligenceRunRepository,
} from "../../infrastructure/repositories/intelligence.repository";
import type { IntelligenceError } from "../../domain/errors/intelligence.errors";
import { INTELLIGENCE_RUN_QUEUE } from "../intelligence.constants";

interface IntelligenceRunJob {
  runId: string;
  tenantId: string;
}

@Injectable()
export class IntelligenceRunWorker implements OnModuleInit {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly queue: QueueService,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly runs: IntelligenceRunRepository,
    private readonly chunks: IntelligenceChunkRepository,
    private readonly client: IntelligenceClient,
    private readonly protector: IntelligencePromptProtector,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "IntelligenceRunWorker" });
  }

  onModuleInit(): void {
    if (env.PROCESS_ROLE === "api" || !env.INTELLIGENCE_ENABLED) return;
    this.queue.addWorker<IntelligenceRunJob>(INTELLIGENCE_RUN_QUEUE, (job) =>
      this.process(job).then((result) =>
        result.isErr() ? Promise.reject(new Error(result.error.type)) : undefined,
      ),
    );
  }

  private async process(job: Job<IntelligenceRunJob>): Promise<Result<void, IntelligenceError>> {
    const { runId, tenantId } = job.data;
    return this.tenantContext.runSystem({ mode: env.TENANCY_MODE, tenantId }, async () => {
      const loaded = await this.database.runTransaction(() => this.runs.findById(runId));
      const run = loaded.isOk() ? loaded.value : null;
      if (!run || run.status === "SUCCEEDED" || run.status === "CANCELLED") return ok(undefined);
      const running = await this.database.runTransaction(() =>
        this.runs.updateById(runId, { status: "RUNNING", errorCode: null }),
      );
      if (running.isErr() || !running.value) return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
      try {
        const prompt = this.protector.decrypt(run.promptCiphertext);
        const context = await this.retrieveContext(run.documentIds, tenantId, prompt);
        if (context.isErr()) {
          await this.fail(runId, context.error);
          return err(context.error);
        }
        const result = await this.client.generate({
          runId,
          tenantId,
          prompt,
          context: context.value,
          outputSchema: run.outputSchema ?? undefined,
          maxOutputTokens: run.maxOutputTokens,
        });
        if (result.isErr()) {
          await this.fail(runId, result.error);
          return err(result.error);
        }
        await this.database.runTransaction(() =>
          this.runs.updateById(runId, {
            status: "SUCCEEDED",
            model: result.value.model,
            resultCiphertext: this.protector.encrypt(result.value.content),
            inputTokens: result.value.inputTokens,
            outputTokens: result.value.outputTokens,
            estimatedCostUsd: String(result.value.estimatedCostUsd),
            citations: result.value.citations,
            completedAt: new Date(),
          }),
        );
        return ok(undefined);
      } catch (error) {
        this.logger.error({ runId, error: String(error) }, "Intelligence run failed");
        const failure = { type: "INTELLIGENCE_REQUEST_FAILED" } as const;
        await this.fail(runId, failure);
        return err(failure);
      }
    });
  }

  private async retrieveContext(
    documentIds: string[],
    tenantId: string,
    prompt: string,
  ): Promise<
    Result<Array<{ citationId: string; content: string; source: string }>, IntelligenceError>
  > {
    if (documentIds.length === 0) return ok([]);
    const embedding = await this.client.embed(tenantId, `run-context-${crypto.randomUUID()}`, [
      prompt,
    ]);
    if (embedding.isErr()) return err(embedding.error);
    const promptVector = embedding.value.vectors[0];
    if (!promptVector || promptVector.length !== 1536) {
      return err({ type: "INTELLIGENCE_INVALID_RESPONSE" });
    }
    const nearest = await this.chunks.findNearest(
      documentIds,
      promptVector,
      env.INTELLIGENCE_MAX_CONTEXT_ITEMS,
    );
    return ok(
      nearest.map((chunk) => ({
        citationId: `${chunk.documentId}:${chunk.ordinal}`,
        content: this.protector.decrypt(chunk.contentCiphertext),
        source: chunk.documentId,
      })),
    );
  }

  private async fail(runId: string, error: IntelligenceError): Promise<void> {
    await this.database.runTransaction(() =>
      this.runs.updateById(runId, {
        status: "FAILED",
        errorCode: error.type,
        completedAt: new Date(),
      }),
    );
  }
}
