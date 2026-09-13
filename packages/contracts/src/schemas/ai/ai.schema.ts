import { z } from "zod";

export const AiMessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type AiMessageRole = z.infer<typeof AiMessageRoleSchema>;

export const AiMessageSchema = z.object({
  role: AiMessageRoleSchema,
  content: z.string(),
  name: z.string().optional(),
});
export type AiMessage = z.infer<typeof AiMessageSchema>;

export const AiTokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type AiTokenUsage = z.infer<typeof AiTokenUsageSchema>;

export const AiChatRequestSchema = z.object({
  messages: z.array(AiMessageSchema).min(1, "At least one message is required"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  tenantId: z.string().optional(),
});
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;

export const AiFinishReasonSchema = z.enum(["stop", "length", "tool_calls", "error"]);
export type AiFinishReason = z.infer<typeof AiFinishReasonSchema>;

export const AiChatResponseSchema = z.object({
  message: AiMessageSchema,
  finishReason: AiFinishReasonSchema.default("stop"),
  model: z.string(),
  usage: AiTokenUsageSchema,
  latencyMs: z.number().nonnegative(),
});
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;

export const AiStreamChunkTypeSchema = z.enum(["token", "tool_call", "done", "error"]);
export type AiStreamChunkType = z.infer<typeof AiStreamChunkTypeSchema>;

export const AiStreamChunkSchema = z.object({
  type: AiStreamChunkTypeSchema,
  content: z.string().optional(),
  seq: z.number().int().nonnegative().optional(),
  usage: AiTokenUsageSchema.optional(),
  error: z.string().optional(),
});
export type AiStreamChunk = z.infer<typeof AiStreamChunkSchema>;

export const AiEmbeddingRequestSchema = z.object({
  input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  model: z.string().optional(),
});
export type AiEmbeddingRequest = z.infer<typeof AiEmbeddingRequestSchema>;

export const AiEmbeddingResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  model: z.string(),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  latencyMs: z.number().nonnegative(),
});
export type AiEmbeddingResponse = z.infer<typeof AiEmbeddingResponseSchema>;
