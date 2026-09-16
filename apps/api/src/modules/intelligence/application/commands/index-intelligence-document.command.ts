import { Injectable } from "@nestjs/common";
import { err, ok, type Result } from "neverthrow";
import type { AuthenticatedUser } from "@repo/contracts";
import { env } from "../../../../config/env";
import { TenantContextService } from "../../../../infrastructure/database";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { GetFileByIdQuery } from "../../../files/application/queries/get-file-by-id.query";
import { IntelligenceDocumentRepository } from "../../infrastructure/repositories/intelligence.repository";
import type { IntelligenceDocumentEntity } from "../../domain/entities/intelligence-document.entity";
import type { IntelligenceError } from "../../domain/errors/intelligence.errors";
import {
  INTELLIGENCE_DOCUMENT_JOB_PREFIX,
  INTELLIGENCE_DOCUMENT_QUEUE,
} from "../intelligence.constants";

interface IntelligenceDocumentJob {
  documentId: string;
  tenantId: string;
}

@Injectable()
export class IndexIntelligenceDocumentCommand {
  constructor(
    private readonly files: GetFileByIdQuery,
    private readonly tenantContext: TenantContextService,
    private readonly documents: IntelligenceDocumentRepository,
    private readonly queue: QueueService,
  ) {}

  async execute(
    fileId: string,
    actor: AuthenticatedUser,
  ): Promise<Result<IntelligenceDocumentEntity, IntelligenceError>> {
    if (!env.INTELLIGENCE_ENABLED) return err({ type: "INTELLIGENCE_DISABLED" });
    if (!env.REDIS_URL) return err({ type: "INTELLIGENCE_UNAVAILABLE" });
    const file = await this.files.execute(fileId, actor);
    if (file.isErr() || file.value.status !== "uploaded") {
      return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
    }
    const tenantId = this.tenantContext.getRequiredTenantId() ?? "single-tenant";
    const existing = await this.documents.findByFile(fileId);
    if (existing.isOk() && existing.value) {
      if (existing.value.status === "RUNNING") return ok(existing.value);
      const queued = await this.documents.markStatus(existing.value.id, "QUEUED", {
        errorCode: null,
      });
      if (queued.isErr() || !queued.value) return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
      try {
        await this.enqueue(existing.value.id, tenantId);
      } catch {
        return err({ type: "INTELLIGENCE_UNAVAILABLE" });
      }
      return ok(queued.value);
    }
    const created = await this.documents.create({
      id: crypto.randomUUID(),
      tenantId,
      fileId,
      sourceObjectKey: file.value.key,
      status: "QUEUED",
      chunkCount: 0,
      parserVersion: "text-v1",
    });
    if (created.isErr()) return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
    try {
      await this.enqueue(created.value.id, tenantId);
    } catch {
      return err({ type: "INTELLIGENCE_UNAVAILABLE" });
    }
    return ok(created.value);
  }

  private async enqueue(documentId: string, tenantId: string): Promise<void> {
    const queue = this.queue.getQueue<IntelligenceDocumentJob>(INTELLIGENCE_DOCUMENT_QUEUE);
    if (!queue) return;
    await queue.add(
      "index",
      { documentId, tenantId },
      {
        jobId: `${INTELLIGENCE_DOCUMENT_JOB_PREFIX}${documentId}`,
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
  }
}
