import type { IntelligenceDocumentEntity } from "../../domain/entities/intelligence-document.entity";
import type { PublicIntelligenceRun } from "../../application/queries/get-intelligence-run.query";

export function toIntelligenceRunResponse(run: PublicIntelligenceRun) {
  return {
    id: run.id,
    status: run.status,
    model: run.model,
    result: run.result,
    errorCode: run.errorCode,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    estimatedCostUsd: run.estimatedCostUsd,
    citations: run.citations,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export function toIntelligenceDocumentResponse(document: IntelligenceDocumentEntity) {
  return {
    id: document.id,
    status: document.status,
    chunkCount: document.chunkCount,
    errorCode: document.errorCode,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
