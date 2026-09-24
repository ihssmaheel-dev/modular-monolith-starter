import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { ExecuteUnaryChatCommand } from "./execute-unary-chat.command";
import { IntelligenceGatewayService } from "../services/intelligence-gateway.service";
import { IntelligenceDisabledError } from "../../domain/errors/intelligence.errors";
import { env } from "../../../../config/env";

describe("ExecuteUnaryChatCommand", () => {
  let command: ExecuteUnaryChatCommand;
  let gateway: IntelligenceGatewayService;

  beforeEach(() => {
    gateway = {
      executeUnaryChat: vi.fn(),
    } as unknown as IntelligenceGatewayService;

    command = new ExecuteUnaryChatCommand(gateway);
  });

  it("returns IntelligenceDisabledError when service is disabled", async () => {
    const original = env.INTELLIGENCE_ENABLED;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = false;
    try {
      const result = await command.execute({
        messages: [{ role: "user", content: "hello" }],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(IntelligenceDisabledError);
      }
      expect(gateway.executeUnaryChat).not.toHaveBeenCalled();
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
    }
  });

  it("delegates to gateway when service is enabled", async () => {
    const original = env.INTELLIGENCE_ENABLED;
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
    try {
      const mockResponse = {
        content: "Generated content",
        model: "gpt-4o-mini",
      };
      vi.mocked(gateway.executeUnaryChat).mockResolvedValue(ok(mockResponse));

      const result = await command.execute({
        messages: [{ role: "user", content: "explain architecture" }],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.content).toBe("Generated content");
      }
      expect(gateway.executeUnaryChat).toHaveBeenCalledOnce();
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = original;
    }
  });
});
