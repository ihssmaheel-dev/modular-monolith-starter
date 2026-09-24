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

    const result = await service.executeUnaryChat({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("AI_DISABLED");
    }

    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
  });

  it("rejects models not present in INTELLIGENCE_ALLOWED_MODELS", async () => {
    const original = env.INTELLIGENCE_ENABLED;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;

    const result = await service.executeUnaryChat({
      messages: [{ role: "user", content: "hello" }],
      model: "unauthorized-malicious-model",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("AI_INVALID_MODEL");
    }

    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
  });

  it("opens circuit breaker after repeated failures", async () => {
    const original = env.INTELLIGENCE_ENABLED;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;

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

    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
  });
});
