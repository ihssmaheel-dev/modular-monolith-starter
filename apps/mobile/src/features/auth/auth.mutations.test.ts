import { describe, expect, it, vi, beforeEach } from "vitest";
import { useMutation } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { renderHookWithProviders } from "@/test/render-hook";
import {
  forgotPasswordMutationOptions,
  loginMutationOptions,
  registerMutationOptions,
  resetPasswordMutationOptions,
} from "./auth.mutations";

vi.mock("@/lib/api", () => ({ getApiClient: vi.fn() }));

const client = {
  auth: { login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn() },
};

const credentials = { email: "u@e.test", password: "Password123!" };

describe("mobile auth mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(client as never);
  });

  it("logs in and returns the session on 200", async () => {
    const session = { accessToken: "a" };
    client.auth.login.mockResolvedValue({ status: 200, body: session });
    const { result } = renderHookWithProviders(() => useMutation(loginMutationOptions()));

    await expect(result.current.mutateAsync(credentials)).resolves.toBe(session);
    expect(client.auth.login).toHaveBeenCalledWith({ body: credentials });
  });

  it("throws loginFailed on bad credentials", async () => {
    client.auth.login.mockResolvedValue({ status: 401, body: null });
    const { result } = renderHookWithProviders(() => useMutation(loginMutationOptions()));

    await expect(result.current.mutateAsync(credentials)).rejects.toThrow("auth.loginFailed");
  });

  it("registers on 201 or 200", async () => {
    const session = { accessToken: "a" };
    client.auth.register.mockResolvedValue({ status: 201, body: session });
    const { result } = renderHookWithProviders(() => useMutation(registerMutationOptions()));

    await expect(result.current.mutateAsync({ ...credentials, name: "U" })).resolves.toBe(session);
  });

  it("throws registrationFailed on conflict", async () => {
    client.auth.register.mockResolvedValue({ status: 409, body: null });
    const { result } = renderHookWithProviders(() => useMutation(registerMutationOptions()));

    await expect(result.current.mutateAsync({ ...credentials, name: "U" })).rejects.toThrow(
      "auth.registrationFailed",
    );
  });

  it("requests a password reset link", async () => {
    client.auth.forgotPassword.mockResolvedValue({ status: 200, body: { ok: true } });
    const { result } = renderHookWithProviders(() => useMutation(forgotPasswordMutationOptions()));

    await result.current.mutateAsync({ email: "u@e.test" });

    expect(client.auth.forgotPassword).toHaveBeenCalledWith({ body: { email: "u@e.test" } });
  });

  it("throws requestFailed when the reset request fails", async () => {
    client.auth.forgotPassword.mockResolvedValue({ status: 429, body: null });
    const { result } = renderHookWithProviders(() => useMutation(forgotPasswordMutationOptions()));

    await expect(result.current.mutateAsync({ email: "u@e.test" })).rejects.toThrow(
      "auth.requestFailed",
    );
  });

  it("resets the password with a valid token", async () => {
    client.auth.resetPassword.mockResolvedValue({ status: 200, body: { ok: true } });
    const { result } = renderHookWithProviders(() => useMutation(resetPasswordMutationOptions()));

    await result.current.mutateAsync({ token: "t", password: "NewPassword123!" });

    expect(client.auth.resetPassword).toHaveBeenCalledWith({
      body: { token: "t", password: "NewPassword123!" },
    });
  });

  it("throws resetFailed on an expired token", async () => {
    client.auth.resetPassword.mockResolvedValue({ status: 410, body: null });
    const { result } = renderHookWithProviders(() => useMutation(resetPasswordMutationOptions()));

    await expect(
      result.current.mutateAsync({ token: "stale", password: "NewPassword123!" }),
    ).rejects.toThrow("auth.resetFailed");
  });
});
