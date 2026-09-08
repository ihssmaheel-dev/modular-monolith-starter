import { describe, expect, it, beforeEach } from "vitest";
import { useAuthStore } from "./auth.store";

const signedOut = {
  status: "unauthenticated",
  accessToken: null,
  refreshToken: null,
  user: null,
} as const;

const user = { id: "u-1", email: "u@e.test", name: "U", role: "user", avatarFileId: null } as const;

describe("mobile auth store", () => {
  beforeEach(() => {
    useAuthStore.setState({ ...signedOut });
  });

  it("transitions loading -> authenticated on setAuth", () => {
    useAuthStore.setState({ ...signedOut, status: "loading" });

    useAuthStore.getState().setAuth({ accessToken: "a", refreshToken: "r", user });

    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      accessToken: "a",
      refreshToken: "r",
      user,
    });
  });

  it("updates the user without touching tokens on setUser", () => {
    useAuthStore.getState().setAuth({ accessToken: "a", refreshToken: "r", user });
    const next = { ...user, name: "Renamed" };

    useAuthStore.getState().setUser(next);

    expect(useAuthStore.getState()).toMatchObject({ accessToken: "a", user: next });
  });

  it("clears credentials but keeps the signed-out shape on clearAuth", () => {
    useAuthStore.getState().setAuth({ accessToken: "a", refreshToken: "r", user });

    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState()).toMatchObject(signedOut);
  });
});
