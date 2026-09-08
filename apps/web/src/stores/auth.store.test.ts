import { describe, expect, it, beforeEach } from "vitest";
import { useAuthStore } from "./auth.store";

const signedOut = {
  status: "unauthenticated",
  accessToken: null,
  refreshToken: null,
  user: null,
} as const;

describe("auth store", () => {
  beforeEach(() => {
    useAuthStore.setState({ ...signedOut });
  });

  it("transitions loading -> authenticated on setAuth", () => {
    useAuthStore.setState({ ...signedOut, status: "loading" });
    const user = { id: "u-1", email: "u@e.test", name: "U", role: "user" } as const;

    useAuthStore.getState().setAuth({ accessToken: "a", refreshToken: "r", user });

    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      accessToken: "a",
      user,
    });
  });

  it("clears credentials but keeps the signed-out shape on clearAuth", () => {
    useAuthStore.getState().setAuth({
      accessToken: "a",
      refreshToken: "r",
      user: { id: "u-1", email: "u@e.test", name: "U", role: "user" },
    });

    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState()).toMatchObject(signedOut);
  });

  it("updates the user without touching tokens on setUser", () => {
    useAuthStore.getState().setAuth({
      accessToken: "a",
      refreshToken: "r",
      user: { id: "u-1", email: "u@e.test", name: "U", role: "user" },
    });
    const next = { id: "u-1", email: "u@e.test", name: "Renamed", role: "user" } as const;

    useAuthStore.getState().setUser(next);

    expect(useAuthStore.getState().user).toEqual(next);
    expect(useAuthStore.getState().accessToken).toBe("a");
  });
});
