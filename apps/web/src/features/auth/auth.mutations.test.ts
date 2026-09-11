import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiClient } from "@/lib/api";
import {
  loginMutationOptions,
  registerMutationOptions,
  resendVerificationMutationOptions,
  verifyEmailMutationOptions,
} from "./auth.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  auth: {
    login: vi.fn(),
    register: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
  },
};

describe("auth mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("uses the existing auth.* keys on login failure (never api.auth.*)", async () => {
    client.auth.login.mockResolvedValue({ status: 401, body: null });

    await expect(
      loginMutationOptions().mutationFn!(
        { email: "u@e.test", password: "wrong" },
        undefined as never,
      ),
    ).rejects.toThrow("auth.loginFailed");
  });

  it("uses the existing auth.* keys on registration failure", async () => {
    client.auth.register.mockResolvedValue({ status: 409, body: null });

    await expect(
      registerMutationOptions().mutationFn!(
        {
          name: "U",
          email: "u@e.test",
          password: "Password123!",
        },
        undefined as never,
      ),
    ).rejects.toThrow("auth.registrationFailed");
  });

  it("returns the auth response on success", async () => {
    const body = { accessToken: "a", refreshToken: "r", user: { id: "u-1" } };
    client.auth.login.mockResolvedValue({ status: 200, body });

    await expect(
      loginMutationOptions().mutationFn!(
        { email: "u@e.test", password: "Password123!" },
        undefined as never,
      ),
    ).resolves.toBe(body);
  });

  it("throws emailNotVerified for unverified accounts", async () => {
    client.auth.login.mockResolvedValue({
      status: 403,
      body: null,
      error: { code: "EMAIL_NOT_VERIFIED" },
    });

    await expect(
      loginMutationOptions().mutationFn!(
        { email: "u@e.test", password: "Password123!" },
        undefined as never,
      ),
    ).rejects.toThrow("auth.emailNotVerified");
  });

  it("verifies the email and returns the session", async () => {
    const body = { accessToken: "a", refreshToken: "r", user: { id: "u-1" } };
    client.auth.verifyEmail.mockResolvedValue({ status: 200, body });

    await expect(
      verifyEmailMutationOptions().mutationFn!("t".repeat(32), undefined as never),
    ).resolves.toBe(body);
    expect(client.auth.verifyEmail).toHaveBeenCalledWith({ body: { token: "t".repeat(32) } });
  });

  it("throws invalidToken when verification fails", async () => {
    client.auth.verifyEmail.mockResolvedValue({ status: 401, body: null });

    await expect(
      verifyEmailMutationOptions().mutationFn!("stale", undefined as never),
    ).rejects.toThrow("auth.invalidToken");
  });

  it("resends the verification email", async () => {
    const body = { message: "ok" };
    client.auth.resendVerification.mockResolvedValue({ status: 200, body });

    await expect(
      resendVerificationMutationOptions().mutationFn!("u@e.test", undefined as never),
    ).resolves.toBe(body);
    expect(client.auth.resendVerification).toHaveBeenCalledWith({ body: { email: "u@e.test" } });
  });
});
