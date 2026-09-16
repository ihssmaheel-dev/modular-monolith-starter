import { Injectable, OnModuleInit } from "@nestjs/common";
import type { Job } from "bullmq";
import { err, ok, type Result } from "neverthrow";
import { env } from "../../../../config/env";
import { DatabaseService, TenantContextService } from "../../../../infrastructure/database";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import { QueueService } from "../../../../infrastructure/queue/queue.service";
import { StorageService } from "../../../../infrastructure/storage/storage.service";
import { IntelligenceClient } from "../../infrastructure/clients/intelligence.client";
import {
  IntelligenceChunkRepository,
  IntelligenceDocumentRepository,
} from "../../infrastructure/repositories/intelligence.repository";
import { IntelligencePromptProtector } from "../../infrastructure/security/prompt-protector";
import { INTELLIGENCE_DOCUMENT_QUEUE } from "../intelligence.constants";
import type { IntelligenceError } from "../../domain/errors/intelligence.errors";

const EMBEDDING_DIMENSION = 1536;

interface IntelligenceDocumentJob {
  documentId: string;
  tenantId: string;
}

@Injectable()
export class IntelligenceDocumentWorker implements OnModuleInit {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly queue: QueueService,
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContextService,
    private readonly documents: IntelligenceDocumentRepository,
    private readonly chunks: IntelligenceChunkRepository,
    private readonly storage: StorageService,
    private readonly client: IntelligenceClient,
    private readonly protector: IntelligencePromptProtector,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "IntelligenceDocumentWorker" });
  }

  onModuleInit(): void {
    if (env.PROCESS_ROLE === "api" || !env.INTELLIGENCE_ENABLED) return;
    this.queue.addWorker<IntelligenceDocumentJob>(INTELLIGENCE_DOCUMENT_QUEUE, (job) =>
      this.process(job).then((result) =>
        result.isErr() ? Promise.reject(new Error(result.error.type)) : undefined,
      ),
    );
  }

  private async process(
    job: Job<IntelligenceDocumentJob>,
  ): Promise<Result<void, IntelligenceError>> {
    const { documentId, tenantId } = job.data;
    return this.tenantContext.runSystem({ mode: env.TENANCY_MODE, tenantId }, async () => {
      const loaded = await this.database.runTransaction(() => this.documents.findById(documentId));
      const document = loaded.isOk() ? loaded.value : null;
      if (!document || document.status === "SUCCEEDED") return ok(undefined);
      const running = await this.database.runTransaction(() =>
        this.documents.markStatus(documentId, "RUNNING", { errorCode: null }),
      );
      if (running.isErr() || !running.value) return err({ type: "INTELLIGENCE_REQUEST_FAILED" });
      try {
        const signedUrl = await this.storage.getPresignedDownloadUrl(document.sourceObjectKey);
        if (signedUrl.isErr()) {
          const failure = { type: "INTELLIGENCE_UNAVAILABLE" } as const;
          await this.fail(documentId, failure);
          return err(failure);
        }
        const parsed = await this.client.parseDocument(tenantId, documentId, signedUrl.value);
        if (parsed.isErr()) {
          await this.fail(documentId, parsed.error);
          return err(parsed.error);
        }
        const texts = parsed.value.chunks.map((chunk) => chunk.content);
        const embeddings = await this.client.embed(tenantId, documentId, texts);
        if (embeddings.isErr()) {
          await this.fail(documentId, embeddings.error);
          return err(embeddings.error);
        }
        if (
          embeddings.value.vectors.length !== texts.length ||
          embeddings.value.vectors.some((vector) => vector.length !== EMBEDDING_DIMENSION)
        ) {
          const failure = { type: "INTELLIGENCE_INVALID_RESPONSE" } as const;
          await this.fail(documentId, failure);
          return err(failure);
        }
        const persisted = await this.database.withResultTransaction(async () => {
          await this.chunks.deleteByDocument(documentId);
          const rows = parsed.value.chunks.map((chunk, index) => ({
            id: crypto.randomUUID(),
            tenantId,
            documentId,
            ordinal: chunk.ordinal,
            contentCiphertext: this.protector.encrypt(chunk.content),
            contentHash: chunk.contentHash,
            embedding: embeddings.value.vectors[index],
            embeddingModel: embeddings.value.model,
          }));
          const created = await this.chunks.createMany(rows);
          if (created.isErr()) return err({ type: "INTELLIGENCE_REQUEST_FAILED" } as const);
          const completed = await this.documents.markStatus(documentId, "SUCCEEDED", {
            chunkCount: rows.length,
            contentHash: parsed.value.chunks[0]?.contentHash ?? null,
            errorCode: null,
          });
          if (completed.isErr() || !completed.value) {
            return err({ type: "INTELLIGENCE_REQUEST_FAILED" } as const);
          }
          return ok(undefined);
        });
        if (persisted.isErr()) {
          const failure = { type: "INTELLIGENCE_REQUEST_FAILED" } as const;
          await this.fail(documentId, failure);
          return err(failure);
        }
        return ok(undefined);
      } catch (error) {
        this.logger.error(
          { documentId, error: String(error) },
          "Intelligence document indexing failed",
        );
        const failure = { type: "INTELLIGENCE_REQUEST_FAILED" } as const;
        await this.fail(documentId, failure);
        return err(failure);
      }
    });
  }

  private async fail(documentId: string, error: IntelligenceError): Promise<void> {
    await this.database.runTransaction(() =>
      this.documents.markStatus(documentId, "FAILED", { errorCode: error.type }),
    );
  }
}
