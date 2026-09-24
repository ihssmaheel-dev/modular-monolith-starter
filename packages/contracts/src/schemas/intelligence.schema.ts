import { z } from "zod";

export const ChatMessageRoleSchema = z.enum(["system", "user", "assistant"]);
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatMessageRoleSchema,
  content: z.string().min(1).max(10000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const UnaryChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(100),
  model: z.string().min(1).max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
});
export type UnaryChatRequest = z.infer<typeof UnaryChatRequestSchema>;

export const ChatUsageSchema = z.object({
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});
export type ChatUsage = z.infer<typeof ChatUsageSchema>;

export const UnaryChatResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  usage: ChatUsageSchema.optional(),
});
export type UnaryChatResponse = z.infer<typeof UnaryChatResponseSchema>;

export const CreateEmbeddingsRequestSchema = z.object({
  texts: z.array(z.string().min(1).max(10000)).min(1).max(100),
});
export type CreateEmbeddingsRequest = z.infer<typeof CreateEmbeddingsRequestSchema>;

export const CreateEmbeddingsResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  modelVersion: z.string(),
  dimension: z.number().int(),
});
export type CreateEmbeddingsResponse = z.infer<typeof CreateEmbeddingsResponseSchema>;

export const SearchDocumentsRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).default(5),
  offset: z.number().int().min(0).max(10000).default(0),
});
export type SearchDocumentsRequest = z.infer<typeof SearchDocumentsRequestSchema>;

export const SearchDocumentResultSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  sourceId: z.string(),
  content: z.string(),
  score: z.number(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SearchDocumentResult = z.infer<typeof SearchDocumentResultSchema>;

export const SearchDocumentsResponseSchema = z.array(SearchDocumentResultSchema);
export type SearchDocumentsResponse = z.infer<typeof SearchDocumentsResponseSchema>;

export const IntelligenceErrorCode = {
  AI_DISABLED: "AI_DISABLED",
  AI_SERVICE_UNAVAILABLE: "AI_SERVICE_UNAVAILABLE",
  AI_REQUEST_TIMEOUT: "AI_REQUEST_TIMEOUT",
  AI_RATE_LIMITED: "AI_RATE_LIMITED",
  AI_INVALID_MODEL: "AI_INVALID_MODEL",
  AI_PAYLOAD_TOO_LARGE: "AI_PAYLOAD_TOO_LARGE",
  AI_UNAUTHORIZED: "AI_UNAUTHORIZED",
} as const;
export type IntelligenceErrorCode =
  (typeof IntelligenceErrorCode)[keyof typeof IntelligenceErrorCode];
