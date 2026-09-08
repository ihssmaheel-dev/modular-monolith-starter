import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { useAuthStore } from "@/stores/auth.store";
import { renderHookWithProviders } from "@/test/utils";
import { useAuth } from "./use-auth";

const user = { id: "u-1", email: "u@e.test", name: "U", role: "user" } as const;

describe("useAuth", () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "a",
      refreshToken: "r",
      user,
    });
  });

  afterEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it("reports authenticated only with both status and user", () => {
    const { result } = renderHookWithProviders(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(user);
  });

  it("reports signed out when the user is missing despite the status", () => {
    useAuthStore.setState({ user: null });
    const { result } = renderHookWithProviders(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
  });
});
