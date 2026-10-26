import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { getApiClient, resetApiClient } from "./api";
import { useAuthStore } from "@/stores/auth.store";

describe("mobile api client", () => {
  beforeEach(() => {
    resetApiClient();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns a singleton client", () => {
    expect(getApiClient()).toBe(getApiClient());
  });

  it("rebuilds the client after reset", () => {
    const first = getApiClient();
    resetApiClient();

    expect(getApiClient()).not.toBe(first);
  });

  it("exposes every domain subclient", () => {
    const client = getApiClient();

    for (const domain of [
      "auth",
      "files",
      "notes",
      "notifications",
      "privacy",
      "tenancy",
      "users",
    ]) {
      expect(client).toHaveProperty(domain);
    }
  });

  it("does not restore mobile credentials when logout races an in-flight refresh", async () => {
    const auth = {
      user: {
        id: "user-a",
        name: "A",
        email: "a@example.com",
        role: "user" as const,
        avatarFileId: null,
      },
      accessToken: "expired",
      refreshToken: "refresh",
    };
    useAuthStore.getState().setAuth(auth);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith("/auth/refresh")) {
          useAuthStore.getState().clearAuth();
          return Response.json({ ...auth, accessToken: "renewed" });
        }
        return new Response("{}", { status: 401 });
      }),
    );

    await getApiClient().auth.me();

    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
