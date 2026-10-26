import { describe, it, expect, vi, afterEach } from "vitest";
import { createOrpcClient } from "./orpc";

const REFRESHED = {
  accessToken: "new-access",
  refreshToken: "new-refresh",
  user: { id: "u-1", email: "u@example.com", name: "U", role: "user", avatarFileId: null },
};

const CREATED = {
  id: "note-1",
  title: "T",
  content: "C",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("createOrpcClient 401 retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should reuse the same idempotency key when retrying after refresh", async () => {
    const keys: Array<string | null> = [];
    let noteCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input instanceof Request ? input : new Request(input);
        if (request.url.endsWith("/rpc/auth/refresh")) {
          return Response.json(REFRESHED, { status: 200 });
        }
        noteCalls += 1;
        keys.push(request.headers.get("idempotency-key"));
        if (noteCalls === 1) return new Response("{}", { status: 401 });
        return Response.json(CREATED, { status: 200 });
      }),
    );

    const client = createOrpcClient("https://api.example.com/api/v1", {
      getAccessToken: () => "expired-access",
    });
    await client.notes.create({ title: "T", content: "C" });

    expect(noteCalls).toBe(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it.each(["tenant", "account"])(
    "does not replay a mutation after changing %s during refresh",
    async (scope) => {
      let tenantId = "tenant-a";
      let identity = "u-1";
      const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
      vi.stubGlobal("fetch", fetch);
      const coordinator = {
        refresh: vi.fn(async () => {
          if (scope === "tenant") tenantId = "tenant-b";
          else identity = "u-2";
          return { kind: "refreshed" as const, response: null };
        }),
        handleFailure: vi.fn(),
      };
      const client = createOrpcClient(
        "https://api.example.com/api/v1",
        {
          getTenantId: () => tenantId,
          getAuthIdentity: () => identity,
        },
        coordinator,
      );

      await expect(client.notes.create({ title: "T", content: "C" })).rejects.toMatchObject({
        status: 401,
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(coordinator.handleFailure).not.toHaveBeenCalled();
    },
  );

  it("discards late responses from a previous account without refreshing the new session", async () => {
    let identity = "u-1";
    const fetch = vi.fn(async () => {
      identity = "u-2";
      return Response.json(CREATED);
    });
    vi.stubGlobal("fetch", fetch);
    const coordinator = { refresh: vi.fn(), handleFailure: vi.fn() };
    const client = createOrpcClient(
      "https://api.example.com/api/v1",
      {
        getAuthIdentity: () => identity,
      },
      coordinator,
    );

    await expect(client.notes.create({ title: "T", content: "C" })).rejects.toMatchObject({
      status: 401,
    });
    expect(coordinator.refresh).not.toHaveBeenCalled();
    expect(coordinator.handleFailure).not.toHaveBeenCalled();
  });

  it("does not replay a cancelled mutation after shared refresh finishes", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const coordinator = {
      refresh: vi.fn(async () => {
        controller.abort();
        return { kind: "refreshed" as const, response: null };
      }),
      handleFailure: vi.fn(),
    };
    const client = createOrpcClient("https://api.example.com/api/v1", {}, coordinator);

    await expect(
      client.notes.create({ title: "T", content: "C" }, { signal: controller.signal }),
    ).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledOnce();
    expect(coordinator.handleFailure).not.toHaveBeenCalled();
  });
});
