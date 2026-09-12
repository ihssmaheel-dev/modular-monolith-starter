import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdatePreferencesCommand } from "./update-preferences.command";
import { PreferencesRepository } from "../../infrastructure/repositories/preferences.repository";

describe("UpdatePreferencesCommand", () => {
  let command: UpdatePreferencesCommand;
  let preferences: PreferencesRepository;

  beforeEach(() => {
    preferences = { replaceAll: vi.fn() } as unknown as PreferencesRepository;
    command = new UpdatePreferencesCommand(preferences);
  });

  it("should reject unknown categories", async () => {
    const result = await command.execute("user-1", [
      { category: "nope", inApp: true, email: true, push: true, digestCadence: "realtime" },
    ]);

    expect(result.isErr() && result.error.type).toBe("PREFERENCE_INVALID");
    expect(preferences.replaceAll).not.toHaveBeenCalled();
  });

  it("should reject duplicate categories", async () => {
    const item = {
      category: "account",
      inApp: true,
      email: true,
      push: true,
      digestCadence: "realtime" as const,
    };
    const result = await command.execute("user-1", [item, item]);

    expect(result.isErr() && result.error.type).toBe("PREFERENCE_INVALID");
  });

  it("should replace all preferences for known categories", async () => {
    const result = await command.execute("user-1", [
      {
        category: "account",
        inApp: false,
        email: true,
        push: false,
        digestCadence: "daily" as const,
      },
    ]);

    expect(result.isOk()).toBe(true);
    expect(preferences.replaceAll).toHaveBeenCalledWith(
      "user-1",
      expect.arrayContaining([expect.objectContaining({ category: "account", inApp: false })]),
    );
  });
});
