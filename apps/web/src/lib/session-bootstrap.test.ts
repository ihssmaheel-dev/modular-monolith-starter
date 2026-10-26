import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifySession } from "./session-bootstrap";
import { getApiClient } from "./api";
import { useAuthStore } from "@/stores/auth.store";

vi.mock("./api", () => ({ getApiClient: vi.fn() }));

const user = {
  id: "user-a",
  name: "A",
  email: "a@example.com",
  role: "user" as const,
  avatarFileId: null,
};

describe("session bootstrap identity races", () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    useAuthStore.setState({ status: "loading", user });
  });

  it("does not restore an identity signed out while auth/me was pending", async () => {
    const me = vi.fn(async () => {
      useAuthStore.getState().clearAuth();
      return { status: 200, body: { user } };
    });
    vi.mocked(getApiClient).mockReturnValue({ auth: { me } } as never);

    await expect(verifySession()).resolves.toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it.each([200, 401])(
    "preserves a newer account when an older bootstrap returns %s",
    async (status) => {
      const nextUser = { ...user, id: "user-b" };
      const me = vi.fn(async () => {
        useAuthStore
          .getState()
          .setAuth({ user: nextUser, accessToken: "new-access", refreshToken: "new-refresh" });
        return { status, body: { user } };
      });
      vi.mocked(getApiClient).mockReturnValue({ auth: { me } } as never);

      await expect(verifySession()).resolves.toBe(true);
      expect(useAuthStore.getState().user).toEqual(nextUser);
      expect(useAuthStore.getState().accessToken).toBe("new-access");
    },
  );
});
