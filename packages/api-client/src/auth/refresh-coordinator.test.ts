import { afterEach, describe, expect, it, vi } from "vitest";

import { createRefreshCoordinator } from "./refresh-coordinator";

const REFRESHED = {
  accessToken: "new-access",
  refreshToken: "new-refresh",
  user: {
    id: "u-1",
    email: "u@example.com",
    name: "User",
    role: "user" as const,
    avatarFileId: null,
  },
};

describe("refresh coordinator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("single-flights concurrent refresh requests", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(REFRESHED));
    vi.stubGlobal("fetch", fetch);
    const onAuthRefreshed = vi.fn();
    const coordinator = createRefreshCoordinator("https://api.test/api/v1", {
      getRefreshToken: () => "mobile-refresh",
      onAuthRefreshed,
    });

    const [first, second] = await Promise.all([coordinator.refresh(), coordinator.refresh()]);

    expect(first).toEqual({ kind: "refreshed", response: REFRESHED });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledOnce();
    expect(onAuthRefreshed).toHaveBeenCalledOnce();
  });

  it("does not restore a session after logout while refresh is in flight", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    let fingerprint = "authenticated:u-1:old-access";
    let accessToken: string | null = "old-access";
    const onAuthRefreshed = vi.fn();
    const coordinator = createRefreshCoordinator("https://api.test/api/v1", {
      getAccessToken: () => accessToken,
      getAuthFingerprint: () => fingerprint,
      getRefreshToken: () => "mobile-refresh",
      onAuthRefreshed,
    });

    const pending = coordinator.refresh();
    fingerprint = "unauthenticated:none:none";
    accessToken = null;
    resolveFetch(Response.json(REFRESHED));

    await expect(pending).resolves.toEqual({ kind: "superseded" });
    expect(onAuthRefreshed).not.toHaveBeenCalled();
  });

  it("requires Web Locks in a browser runtime", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("navigator", {});
    const coordinator = createRefreshCoordinator("https://api.test/api/v1", {});

    await expect(coordinator.refresh()).resolves.toEqual({ kind: "unsupported" });
  });

  it.each([200, 401])(
    "ignores a stale refresh response (%s) after switching account",
    async (status) => {
      let resolveFetch!: (response: Response) => void;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              resolveFetch = resolve;
            }),
        ),
      );
      let identity = "u-1";
      let token = "old-access";
      const onAuthRefreshed = vi.fn();
      const coordinator = createRefreshCoordinator("https://api.test/api/v1", {
        getAuthIdentity: () => identity,
        getAuthFingerprint: () => `${identity}:${token}`,
        getAccessToken: () => token,
        onAuthRefreshed,
      });
      const pending = coordinator.refresh();
      identity = "u-2";
      token = "other-account-access";
      resolveFetch(status === 200 ? Response.json(REFRESHED) : new Response(null, { status }));

      await expect(pending).resolves.toEqual({ kind: "superseded" });
      expect(onAuthRefreshed).not.toHaveBeenCalled();
    },
  );

  it("does not adopt another account returned by a replaced browser cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...REFRESHED,
          user: { ...REFRESHED.user, id: "u-2" },
        }),
      ),
    );
    const onAuthRefreshed = vi.fn();
    const coordinator = createRefreshCoordinator("https://api.test/api/v1", {
      getAuthIdentity: () => "u-1",
      onAuthRefreshed,
    });
    await expect(coordinator.refresh()).resolves.toEqual({ kind: "superseded" });
    expect(onAuthRefreshed).not.toHaveBeenCalled();
  });

  it("reuses a refresh adopted while waiting for the browser lock", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { cookie: "" });
    let token = "old-access";
    let fingerprint = "authenticated:u-1:old-access";
    const request = vi.fn(async (_name, _options, callback: () => Promise<unknown>) => {
      token = "new-access";
      fingerprint = "authenticated:u-1:new-access";
      return callback();
    });
    vi.stubGlobal("navigator", { locks: { request } });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const coordinator = createRefreshCoordinator("https://api.test/api/v1", {
      getAccessToken: () => token,
      getAuthFingerprint: () => fingerprint,
    });

    await expect(coordinator.refresh()).resolves.toEqual({ kind: "refreshed", response: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("classifies server failures without notifying permanent auth failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const onAuthFailure = vi.fn();
    const coordinator = createRefreshCoordinator("https://api.test/api/v1", { onAuthFailure });

    await expect(coordinator.refresh()).resolves.toEqual({
      kind: "retryable_failure",
      reason: "server",
    });
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
});
