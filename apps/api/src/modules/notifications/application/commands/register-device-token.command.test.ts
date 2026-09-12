import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { RegisterDeviceTokenCommand } from "./register-device-token.command";
import { DeviceTokensRepository } from "../../infrastructure/repositories/device-tokens.repository";

describe("RegisterDeviceTokenCommand", () => {
  let command: RegisterDeviceTokenCommand;
  let devices: DeviceTokensRepository;

  beforeEach(() => {
    devices = {
      upsertToken: vi.fn(),
      deleteByUserAndId: vi.fn(),
    } as unknown as DeviceTokensRepository;
    command = new RegisterDeviceTokenCommand(devices);
  });

  it("should reject non-Expo tokens for the expo provider", async () => {
    const result = await command.execute("user-1", {
      platform: "ios",
      provider: "expo",
      token: "fcm:abc",
    });

    expect(result.isErr() && result.error.type).toBe("DEVICE_TOKEN_INVALID");
    expect(devices.upsertToken).not.toHaveBeenCalled();
  });

  it("should upsert a valid Expo token", async () => {
    vi.mocked(devices.upsertToken).mockResolvedValue(ok({ id: "dev-1" }) as never);

    const result = await command.execute("user-1", {
      platform: "ios",
      provider: "expo",
      token: "ExponentPushToken[abc]",
    });

    expect(result.isOk()).toBe(true);
    expect(devices.upsertToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", token: "ExponentPushToken[abc]" }),
    );
  });

  it("should only delete the caller's own device", async () => {
    vi.mocked(devices.deleteByUserAndId).mockResolvedValue(false);

    const result = await command.deleteDevice("user-1", "dev-9");

    expect(result.isErr() && result.error.type).toBe("DEVICE_TOKEN_INVALID");
  });
});
