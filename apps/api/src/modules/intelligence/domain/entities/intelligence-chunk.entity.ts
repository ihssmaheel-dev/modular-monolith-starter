export interface IntelligenceChunkEntity {
  id: string;
  tenantId: string;
  documentId: string;
  ordinal: number;
  contentCiphertext: string;
  contentHash: string;
  embedding: number[] | null;
  embeddingModel: string | null;
  createdAt: Date;
}
