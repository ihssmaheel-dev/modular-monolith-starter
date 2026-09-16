import type { IntelligenceRunStatus } from "@repo/contracts";

export interface IntelligenceRunEntity {
  id: string;
  tenantId: string;
  requestedBy: string;
  status: IntelligenceRunStatus;
  promptCiphertext: string;
  outputSchema: Record<string, unknown> | null;
  documentIds: string[];
  maxOutputTokens: number;
  model: string | null;
  resultCiphertext: string | null;
  errorCode: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  citations: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
