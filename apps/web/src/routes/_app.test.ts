import { describe, expect, it, beforeEach, vi } from "vitest";
import { useAuthStore } from "@/stores/auth.store";
import { getApiClient } from "@/lib/api";
import { Route, verifySession } from "./_app";
import { FRONTEND_ROUTES } from "@repo/contracts";

vi.mock("@/lib/api", () => ({
  getApiClient: vi.fn(),
}));

const mockUser = {
  id: "u-123",
  email: "test@example.com",
  name: "Test User",
  role: "user",
  avatarFileId: null,
} as const;

describe("_app route & verifySession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clearAuth();
  });

  describe("verifySession", () => {
    it("returns true immediately without network call when already authenticated", async () => {
      useAuthStore.setState({ status: "authenticated", user: mockUser });
      const meMock = vi.fn();
      vi.mocked(getApiClient).mockReturnValue({ auth: { me: meMock } } as never);

      const result = await verifySession();

      expect(result).toBe(true);
      expect(meMock).not.toHaveBeenCalled();
    });

    it("calls auth.me() when loading and transitions to authenticated on success", async () => {
      useAuthStore.setState({ status: "loading", user: mockUser });
      const meMock = vi.fn().mockResolvedValue({ status: 200, body: { user: mockUser } });
      vi.mocked(getApiClient).mockReturnValue({ auth: { me: meMock } } as never);

      const result = await verifySession();

      expect(result).toBe(true);
      expect(meMock).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().status).toBe("authenticated");
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it("deduplicates concurrent calls using a single-flight promise", async () => {
      useAuthStore.setState({ status: "loading", user: mockUser });
      let resolveMe: (val: unknown) => void = () => {};
      const mePromise = new Promise((resolve) => {
        resolveMe = resolve;
      });
      const meMock = vi.fn().mockReturnValue(mePromise);
      vi.mocked(getApiClient).mockReturnValue({ auth: { me: meMock } } as never);

      const [res1Promise, res2Promise] = [verifySession(), verifySession()];

      expect(meMock).toHaveBeenCalledTimes(1);

      resolveMe({ status: 200, body: { user: mockUser } });
      const [res1, res2] = await Promise.all([res1Promise, res2Promise]);

      expect(res1).toBe(true);
      expect(res2).toBe(true);
      expect(meMock).toHaveBeenCalledTimes(1);
    });

    it("returns false on non-200 response or network error", async () => {
      useAuthStore.setState({ status: "loading", user: mockUser });
      const meMock = vi.fn().mockResolvedValue({ status: 401, body: null });
      vi.mocked(getApiClient).mockReturnValue({ auth: { me: meMock } } as never);

      const result = await verifySession();

      expect(result).toBe(false);
      expect(useAuthStore.getState().status).toBe("loading");
    });
  });

  describe("Route.options.beforeLoad", () => {
    const beforeLoad = Route.options.beforeLoad;
    if (!beforeLoad) throw new Error("beforeLoad is undefined");

    it("redirects to auth if status is unauthenticated", async () => {
      useAuthStore.setState({ status: "unauthenticated", user: null });

      await expect(beforeLoad({} as never)).rejects.toMatchObject({
        options: { to: FRONTEND_ROUTES.auth },
      });
    });

    it("redirects to auth if user is null even if status is not unauthenticated", async () => {
      useAuthStore.setState({ status: "loading", user: null });

      await expect(beforeLoad({} as never)).rejects.toMatchObject({
        options: { to: FRONTEND_ROUTES.auth },
      });
    });

    it("passes through without network call when already authenticated", async () => {
      useAuthStore.setState({ status: "authenticated", user: mockUser, accessToken: null });
      const meMock = vi.fn();
      vi.mocked(getApiClient).mockReturnValue({ auth: { me: meMock } } as never);

      await expect(beforeLoad({} as never)).resolves.toBeUndefined();
      expect(meMock).not.toHaveBeenCalled();
    });

    it("clears auth and redirects to auth if session verification fails", async () => {
      useAuthStore.setState({ status: "loading", user: mockUser });
      const meMock = vi.fn().mockResolvedValue({ status: 401, body: null });
      vi.mocked(getApiClient).mockReturnValue({ auth: { me: meMock } } as never);

      await expect(beforeLoad({} as never)).rejects.toMatchObject({
        options: { to: FRONTEND_ROUTES.auth },
      });
      expect(useAuthStore.getState().status).toBe("unauthenticated");
      expect(useAuthStore.getState().user).toBeNull();
    });

    it("succeeds when session verification passes", async () => {
      useAuthStore.setState({ status: "loading", user: mockUser });
      const meMock = vi.fn().mockResolvedValue({ status: 200, body: { user: mockUser } });
      vi.mocked(getApiClient).mockReturnValue({ auth: { me: meMock } } as never);

      await expect(beforeLoad({} as never)).resolves.toBeUndefined();
      expect(useAuthStore.getState().status).toBe("authenticated");
    });
  });
});
