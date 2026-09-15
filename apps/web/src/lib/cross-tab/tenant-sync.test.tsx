import { render } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { createBroadcastChannel } from "./channel";
import { scopedChannel } from "./sync";
import { TENANT_SYNC_CHANNEL, TenantSync, type TenantSyncEvent } from "./tenant-sync";

const TENANT_A = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const TENANT_B = "650e8400-e29b-41d4-a716-446655440000";
const user = { id: "user-1", email: "a@example.test", name: "Ada", role: "user" } as const;

describe("tenant sync", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: user as never, status: "authenticated" });
    useTenantStore.setState({ tenantId: TENANT_A });
  });

  it("applies valid tenant changes from the same identity scope", async () => {
    render(<TenantSync />);
    const remote = createBroadcastChannel<TenantSyncEvent>(
      scopedChannel(TENANT_SYNC_CHANNEL, { userId: user.id }),
    );

    await act(async () => {
      remote.post({ type: "tenant-changed", tenantId: TENANT_B });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await vi.waitFor(() => expect(useTenantStore.getState().tenantId).toBe(TENANT_B));
    remote.close();
  });

  it("publishes local changes only on the signed-in user's channel", async () => {
    render(<TenantSync />);
    const sameUser = createBroadcastChannel<TenantSyncEvent>(
      scopedChannel(TENANT_SYNC_CHANNEL, { userId: user.id }),
    );
    const otherUser = createBroadcastChannel<TenantSyncEvent>(
      scopedChannel(TENANT_SYNC_CHANNEL, { userId: "user-2" }),
    );
    const seen: TenantSyncEvent[] = [];
    const leaked: TenantSyncEvent[] = [];
    const unsubscribeSame = sameUser.subscribe((event) => seen.push(event));
    const unsubscribeOther = otherUser.subscribe((event) => leaked.push(event));

    act(() => useTenantStore.getState().setTenantId(TENANT_B));

    await vi.waitFor(() => expect(seen).toEqual([{ type: "tenant-changed", tenantId: TENANT_B }]));
    expect(leaked).toEqual([]);
    unsubscribeSame();
    unsubscribeOther();
    sameUser.close();
    otherUser.close();
  });

  it("ignores malformed tenant identifiers", async () => {
    render(<TenantSync />);
    const remote = createBroadcastChannel<TenantSyncEvent>(
      scopedChannel(TENANT_SYNC_CHANNEL, { userId: user.id }),
    );

    remote.post({ type: "tenant-changed", tenantId: "not-a-tenant-id" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(useTenantStore.getState().tenantId).toBe(TENANT_A);
    remote.close();
  });
});
