import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AiService } from "./ai.service";
import type { PinoLoggerService } from "../logger/logger.service";
import { env } from "../../config/env";

describe("AiService", () => {
  let service: AiService;
  let mockLogger: PinoLoggerService;
  const originalAiEnabled = env.AI_ENABLED;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockLogger = {
      child: vi.fn().mockReturnThis(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as PinoLoggerService;

    service = new AiService(mockLogger);
  });

  afterEach(() => {
    (env as { AI_ENABLED: boolean }).AI_ENABLED = originalAiEnabled;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns AI_DISABLED when AI_ENABLED is false", async () => {
    (env as { AI_ENABLED: boolean }).AI_ENABLED = false;

    const result = await service.chat({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("AI_DISABLED");
    }
  });

  it("sends chat request and parses response when AI_ENABLED is true", async () => {
    (env as { AI_ENABLED: boolean }).AI_ENABLED = true;

    const mockResponsePayload = {
      message: { role: "assistant", content: "Hello from AI" },
      finishReason: "stop",
      model: "mock-model",
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
      latencyMs: 120,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponsePayload),
    });

    const result = await service.chat({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.message.content).toBe("Hello from AI");
      expect(result.value.model).toBe("mock-model");
    }
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/chat"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "X-Internal-Token": expect.any(String),
        }),
      }),
    );
  });

  it("returns AI_UNAVAILABLE on non-200 HTTP response", async () => {
    (env as { AI_ENABLED: boolean }).AI_ENABLED = true;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue("Service Overloaded"),
    });

    const result = await service.chat({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("AI_UNAVAILABLE");
    }
  });

  it("returns AI_INVALID_RESPONSE on schema mismatch", async () => {
    (env as { AI_ENABLED: boolean }).AI_ENABLED = true;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ unexpected: "data" }),
    });

    const result = await service.chat({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("AI_INVALID_RESPONSE");
    }
  });

  it("returns embeddings response when valid", async () => {
    (env as { AI_ENABLED: boolean }).AI_ENABLED = true;

    const mockEmbeddingPayload = {
      embeddings: [[0.1, 0.2, 0.3]],
      model: "mock-embedder",
      usage: { promptTokens: 3, totalTokens: 3 },
      latencyMs: 15,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockEmbeddingPayload),
    });

    const result = await service.generateEmbeddings({
      input: "Embed this",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
    }
  });
});
