import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { IntelligenceGatewayService } from "./intelligence-gateway.service";
import { IntelligenceHmacService } from "./intelligence-hmac.service";
import { env } from "../../../../config/env";

describe("IntelligenceGatewayService", () => {
  let service: IntelligenceGatewayService;
  let hmacService: IntelligenceHmacService;

  beforeEach(() => {
    hmacService = new IntelligenceHmacService();
    service = new IntelligenceGatewayService(hmacService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns IntelligenceDisabledError when INTELLIGENCE_ENABLED is false", async () => {
    const original = env.INTELLIGENCE_ENABLED;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = false;
    try {
      const result = await service.executeUnaryChat({
        messages: [{ role: "user", content: "hello" }],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("AI_DISABLED");
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
    }
  });

  it("rejects models not present in INTELLIGENCE_ALLOWED_MODELS", async () => {
    const original = env.INTELLIGENCE_ENABLED;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
    try {
      const result = await service.executeUnaryChat({
        messages: [{ role: "user", content: "hello" }],
        model: "unauthorized-malicious-model",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("AI_INVALID_MODEL");
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
    }
  });

  it("prevents substring bypass on model allowlist", async () => {
    const origEnabled = env.INTELLIGENCE_ENABLED;
    const origModels = env.INTELLIGENCE_ALLOWED_MODELS;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
    (env as { INTELLIGENCE_ALLOWED_MODELS: string }).INTELLIGENCE_ALLOWED_MODELS =
      "gpt-4o,gpt-4o-mini";
    try {
      // "gpt" is a substring of "gpt-4o" but not an exact model match
      const result = await service.executeUnaryChat({
        messages: [{ role: "user", content: "hello" }],
        model: "gpt",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("AI_INVALID_MODEL");
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = origEnabled;
      (env as { INTELLIGENCE_ALLOWED_MODELS: string }).INTELLIGENCE_ALLOWED_MODELS = origModels;
    }
  });

  it("opens circuit breaker after repeated failures", async () => {
    const original = env.INTELLIGENCE_ENABLED;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
    try {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Connection refused"));

      // Trigger 3 failures to reach failureThreshold
      for (let i = 0; i < 3; i++) {
        const res = await service.executeUnaryChat({
          messages: [{ role: "user", content: "hello" }],
        });
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
          expect(res.error.type).toBe("AI_SERVICE_UNAVAILABLE");
        }
      }

      // 4th call should fail immediately via OPEN circuit breaker
      const fourth = await service.executeUnaryChat({
        messages: [{ role: "user", content: "hello" }],
      });
      expect(fourth.isErr()).toBe(true);
      if (fourth.isErr()) {
        expect(fourth.error.type).toBe("AI_SERVICE_UNAVAILABLE");
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
    }
  });

  it("proxies searchDocuments with proper headers and payload", async () => {
    const original = env.INTELLIGENCE_ENABLED;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
    try {
      const mockResults = [
        {
          id: "doc-1",
          sourceType: "note",
          sourceId: "n-1",
          content: "Architecture notes",
          score: 0.9,
          metadata: {},
        },
      ];
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockResults,
      } as unknown as Response);

      const res = await service.searchDocuments(
        { query: "architecture", limit: 5, offset: 0 },
        "tenant-test",
      );

      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toEqual(mockResults);
      }
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
    }
  });
});
