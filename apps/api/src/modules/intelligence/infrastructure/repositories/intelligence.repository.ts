import { Injectable } from "@nestjs/common";
import type { Result } from "neverthrow";
import { and, eq, sql } from "drizzle-orm";
import {
  BaseRepository,
  DatabaseService,
  TenantContextService,
} from "../../../../infrastructure/database";
import {
  intelligenceDocuments,
  intelligenceDocumentChunks,
  type IntelligenceDocumentChunkRow,
  intelligenceRuns,
  type IntelligenceDocumentRow,
  type IntelligenceRunRow,
} from "../schemas/intelligence.schema";
import type { IntelligenceDocumentEntity } from "../../domain/entities/intelligence-document.entity";
import type { IntelligenceRunEntity } from "../../domain/entities/intelligence-run.entity";
import type { IntelligenceChunkEntity } from "../../domain/entities/intelligence-chunk.entity";

@Injectable()
export class IntelligenceRunRepository extends BaseRepository<
  IntelligenceRunEntity,
  IntelligenceRunRow
> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(intelligenceRuns, database, tenantContext, true);
  }

  protected toDomain(row: IntelligenceRunRow): IntelligenceRunEntity {
    return {
      id: row.id,
      tenantId: row.tenantId,
      requestedBy: row.requestedBy,
      status: row.status,
      promptCiphertext: row.promptCiphertext,
      outputSchema: (row.outputSchema as Record<string, unknown> | null) ?? null,
      documentIds: Array.isArray(row.documentIds)
        ? row.documentIds.filter((item): item is string => typeof item === "string")
        : [],
      maxOutputTokens: row.maxOutputTokens,
      model: row.model,
      resultCiphertext: row.resultCiphertext,
      errorCode: row.errorCode,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      estimatedCostUsd: Number(row.estimatedCostUsd),
      citations: Array.isArray(row.citations)
        ? row.citations.filter((item): item is string => typeof item === "string")
        : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    };
  }
}

@Injectable()
export class IntelligenceDocumentRepository extends BaseRepository<
  IntelligenceDocumentEntity,
  IntelligenceDocumentRow
> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(intelligenceDocuments, database, tenantContext, true);
  }

  protected toDomain(row: IntelligenceDocumentRow): IntelligenceDocumentEntity {
    return {
      id: row.id,
      tenantId: row.tenantId,
      fileId: row.fileId,
      sourceObjectKey: row.sourceObjectKey,
      contentHash: row.contentHash,
      parserVersion: row.parserVersion,
      status: row.status,
      chunkCount: row.chunkCount,
      errorCode: row.errorCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findByFile(fileId: string): Promise<Result<IntelligenceDocumentEntity | null, never>> {
    return this.findOne({ fileId });
  }

  async markStatus(
    id: string,
    status: IntelligenceDocumentEntity["status"],
    update: Record<string, unknown> = {},
  ): Promise<Result<IntelligenceDocumentEntity | null, { type: "CONFLICT" }>> {
    return this.updateById(id, { status, ...update });
  }
}

@Injectable()
export class IntelligenceChunkRepository extends BaseRepository<
  IntelligenceChunkEntity,
  IntelligenceDocumentChunkRow
> {
  constructor(database: DatabaseService, tenantContext: TenantContextService) {
    super(intelligenceDocumentChunks, database, tenantContext, true);
  }

  protected toDomain(row: IntelligenceDocumentChunkRow): IntelligenceChunkEntity {
    return {
      id: row.id,
      tenantId: row.tenantId,
      documentId: row.documentId,
      ordinal: row.ordinal,
      contentCiphertext: row.contentCiphertext,
      contentHash: row.contentHash,
      embedding: row.embedding,
      embeddingModel: row.embeddingModel,
      createdAt: row.createdAt,
    };
  }

  async deleteByDocument(documentId: string): Promise<void> {
    const tenantId = this.tenantFilter()?.tenantId;
    const condition = tenantId
      ? and(
          eq(intelligenceDocumentChunks.documentId, documentId),
          eq(intelligenceDocumentChunks.tenantId, tenantId as string),
        )
      : eq(intelligenceDocumentChunks.documentId, documentId);
    await this.getDb().delete(intelligenceDocumentChunks).where(condition);
  }

  async findNearest(
    documentIds: string[],
    embedding: number[],
    limit: number,
  ): Promise<IntelligenceChunkEntity[]> {
    if (documentIds.length === 0 || this.hasMissingTenantContext()) return [];
    const tenantId = this.tenantFilter()?.tenantId;
    const vector = `[${embedding.join(",")}]`;
    const result = await this.getDb().execute(sql`
      SELECT id, tenant_id AS "tenantId", document_id AS "documentId", ordinal,
        content_ciphertext AS "contentCiphertext", content_hash AS "contentHash",
        embedding, embedding_model AS "embeddingModel", created_at AS "createdAt"
      FROM intelligence_document_chunks
      WHERE tenant_id = ${tenantId ?? "single-tenant"}
        AND document_id = ANY(${documentIds})
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit}
    `);
    return (result.rows as IntelligenceDocumentChunkRow[]).map((row) => this.toDomain(row));
  }
}
