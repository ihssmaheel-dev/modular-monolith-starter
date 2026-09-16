export type IntelligenceDocumentStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface IntelligenceDocumentEntity {
  id: string;
  tenantId: string;
  fileId: string;
  sourceObjectKey: string;
  contentHash: string | null;
  parserVersion: string;
  status: IntelligenceDocumentStatus;
  chunkCount: number;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}
