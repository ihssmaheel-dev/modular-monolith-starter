import type { SearchDocumentResult, UnaryChatResponse } from "@repo/contracts";

export function toUnaryChatResponse(response: UnaryChatResponse): UnaryChatResponse {
  return {
    content: response.content,
    model: response.model,
    usage: response.usage,
  };
}

export function toSearchDocumentsResponse(results: SearchDocumentResult[]): SearchDocumentResult[] {
  return results.map((r) => ({
    id: r.id,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    content: r.content,
    score: r.score,
    metadata: r.metadata,
  }));
}
