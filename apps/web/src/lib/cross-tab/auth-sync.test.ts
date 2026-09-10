import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getQueryClient } from "@/lib/query-client";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { createBroadcastChannel } from "./channel";
import {
  AUTH_SYNC_CHANNEL,
  initAuthSync,
  publishSignedIn,
  publishSignedOut,
  signOutLocally,
  type AuthSyncEvent,
} from "./auth-sync";

const userA = { id: "u-1", email: "a@example.com", name: "Ada", role: "user" } as const;
const sessionA = { accessToken: "a", refreshToken: "r", user: userA };
const sessionB = {
  accessToken: "b",
  refreshToken: "s",
  user: { id: "u-2", email: "b@example.com", name: "Bo", role: "user" },
} as const;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("auth sync", () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    useAuthStore.setState({
      status: "unauthenticated",
      accessToken: null,
      refreshToken: null,
      user: null,
    });
    useTenantStore.setState({ tenantId: null });
    getQueryClient().clear();
  });

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    await flush();
    useAuthStore.setState({
      status: "unauthenticated",
      accessToken: null,
      refreshToken: null,
      user: null,
    });
    useTenantStore.setState({ tenantId: null });
    getQueryClient().clear();
  });

  it("applies a remote sign-out to a signed-in tab", async () => {
    useAuthStore.getState().setAuth(sessionA as never);
    useTenantStore.getState().setTenantId("3fa85f64-5717-4562-b3fc-2c963f66afa6");
    const onSignedOut = vi.fn();
    cleanups.push(initAuthSync({ onSignedOut }));
    const remote = createBroadcastChannel<AuthSyncEvent>(AUTH_SYNC_CHANNEL);
    cleanups.push(() => remote.close());

    remote.post({ type: "signed-out", userId: "u-1" });

    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe("unauthenticated"));
    expect(useTenantStore.getState().tenantId).toBeNull();
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it("ignores a sign-out for a different user", async () => {
    useAuthStore.getState().setAuth(sessionA as never);
    const onSignedOut = vi.fn();
    cleanups.push(initAuthSync({ onSignedOut }));
    const remote = createBroadcastChannel<AuthSyncEvent>(AUTH_SYNC_CHANNEL);
    cleanups.push(() => remote.close());

    remote.post({ type: "signed-out", userId: "u-2" });
    await flush();

    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("skips redundant work when already signed out", async () => {
    const onSignedOut = vi.fn();
    cleanups.push(initAuthSync({ onSignedOut }));
    const remote = createBroadcastChannel<AuthSyncEvent>(AUTH_SYNC_CHANNEL);
    cleanups.push(() => remote.close());

    remote.post({ type: "signed-out", userId: null });
    await flush();

    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("adopts a remote sign-in only when logged out", async () => {
    const onSignedOut = vi.fn();
    cleanups.push(initAuthSync({ onSignedOut }));
    const remote = createBroadcastChannel<AuthSyncEvent>(AUTH_SYNC_CHANNEL);
    cleanups.push(() => remote.close());

    publishSignedIn(sessionB as never);
    await vi.waitFor(() => expect(useAuthStore.getState().user?.id).toBe("u-2"));

    publishSignedIn(sessionA as never);
    await flush();
    expect(useAuthStore.getState().user?.id).toBe("u-2");
  });

  it("signOutLocally clears query cache, tenant, and auth together", () => {
    useAuthStore.getState().setAuth(sessionA as never);
    useTenantStore.setState({ tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });
    getQueryClient().setQueryData(["probe"], { ok: true });

    signOutLocally();

    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useTenantStore.getState().tenantId).toBeNull();
    expect(getQueryClient().getQueryCache().findAll()).toHaveLength(0);
  });

  it("publishes through the shared channel", async () => {
    const seen: AuthSyncEvent[] = [];
    const remote = createBroadcastChannel<AuthSyncEvent>(AUTH_SYNC_CHANNEL);
    const unsubscribe = remote.subscribe((message) => {
      seen.push(message);
    });
    cleanups.push(() => {
      unsubscribe();
      remote.close();
    });

    publishSignedOut("u-1");

    await vi.waitFor(() => expect(seen).toEqual([{ type: "signed-out", userId: "u-1" }]));
  });
});
