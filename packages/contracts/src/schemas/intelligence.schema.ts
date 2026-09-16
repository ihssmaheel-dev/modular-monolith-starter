import { z } from "zod";

export const IntelligenceRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "DEAD_LETTER",
]);

export const CreateIntelligenceRunSchema = z.object({
  prompt: z.string().trim().min(1).max(100_000),
  documentIds: z.array(z.string().min(1).max(128)).max(20).default([]),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  maxOutputTokens: z.number().int().positive().max(16_384).default(2_048),
});

export const IntelligenceRunIdParamSchema = z.object({ id: z.string().min(1).max(128) });

export const IntelligenceRunResponseSchema = z.object({
  id: z.string(),
  status: IntelligenceRunStatusSchema,
  model: z.string().nullable(),
  result: z.string().nullable(),
  errorCode: z.string().nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  citations: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const IndexIntelligenceDocumentSchema = IntelligenceRunIdParamSchema;

export const IntelligenceDocumentStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]),
  chunkCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type IntelligenceRunStatus = z.infer<typeof IntelligenceRunStatusSchema>;
export type CreateIntelligenceRunInput = z.infer<typeof CreateIntelligenceRunSchema>;
export type IntelligenceRunResponse = z.infer<typeof IntelligenceRunResponseSchema>;
export type IndexIntelligenceDocumentInput = z.infer<typeof IndexIntelligenceDocumentSchema>;
export type IntelligenceDocumentStatus = z.infer<typeof IntelligenceDocumentStatusSchema>;
