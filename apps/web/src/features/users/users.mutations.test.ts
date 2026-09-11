import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import {
  requestEmailChangeMutationOptions,
  verifyEmailChangeMutationOptions,
} from "./users.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  users: {
    requestEmailChange: vi.fn(),
    verifyEmailChange: vi.fn(),
  },
};

describe("users email-change mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("requests an email change and returns the message", async () => {
    const body = { message: "ok" };
    client.users.requestEmailChange.mockResolvedValue({ status: 201, body });

    await expect(
      requestEmailChangeMutationOptions().mutationFn!("new@example.com", undefined as never),
    ).resolves.toBe(body);
    expect(client.users.requestEmailChange).toHaveBeenCalledWith({
      body: { email: "new@example.com" },
    });
  });

  it("maps a taken address to the translated key", async () => {
    client.users.requestEmailChange.mockResolvedValue({
      status: 409,
      body: null,
      error: { code: "EMAIL_TAKEN" },
    });

    await expect(
      requestEmailChangeMutationOptions().mutationFn!("taken@example.com", undefined as never),
    ).rejects.toThrow("api.user.emailTaken");
  });

  it("verifies the change and returns the updated user", async () => {
    const body = { id: "user-1", email: "new@example.com" };
    client.users.verifyEmailChange.mockResolvedValue({ status: 200, body });

    await expect(
      verifyEmailChangeMutationOptions().mutationFn!("t".repeat(64), undefined as never),
    ).resolves.toBe(body);
    expect(client.users.verifyEmailChange).toHaveBeenCalledWith({
      body: { token: "t".repeat(64) },
    });
  });

  it("maps an invalid token to the translated key", async () => {
    client.users.verifyEmailChange.mockResolvedValue({
      status: 401,
      body: null,
      error: { code: "INVALID_EMAIL_CHANGE_TOKEN" },
    });

    await expect(
      verifyEmailChangeMutationOptions().mutationFn!("stale", undefined as never),
    ).rejects.toThrow("api.user.invalidEmailChangeToken");
  });
});
