import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ok } from "neverthrow";
import { ExecuteUnaryChatCommand } from "./execute-unary-chat.command";
import { IntelligenceGatewayService } from "../services/intelligence-gateway.service";
import { IntelligenceDisabledError } from "../../domain/errors/intelligence.errors";
import { env } from "../../../../config/env";

describe("ExecuteUnaryChatCommand", () => {
  let command: ExecuteUnaryChatCommand;
  let gateway: IntelligenceGatewayService;
  const savedEnabled = env.INTELLIGENCE_ENABLED;

  beforeEach(() => {
    gateway = {
      executeUnaryChat: vi.fn(),
    } as unknown as IntelligenceGatewayService;

    command = new ExecuteUnaryChatCommand(gateway);
  });

  afterEach(() => {
    (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
  });

  it("returns IntelligenceDisabledError when service is disabled", async () => {
    try {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = false;
      const result = await command.execute({
        messages: [{ role: "user", content: "hello" }],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(IntelligenceDisabledError);
      }
      expect(gateway.executeUnaryChat).not.toHaveBeenCalled();
    } finally {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
    }
  });

  it("delegates to gateway when service is enabled", async () => {
    try {
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = true;
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
      (env as { INTELLIGENCE_ENABLED: boolean }).INTELLIGENCE_ENABLED = savedEnabled;
    }
  });
});
