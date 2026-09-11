import { describe, expect, it, vi, beforeEach } from "vitest";
import { broadcastQueryClient } from "@tanstack/query-broadcast-client-experimental";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { QueryBroadcaster } from "./query-sync";

const TENANT = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

// NOTE: the shared createTestQueryClient uses gcTime: 0, which collects
// inactive queries before broadcasts (and assertions) can observe them.
// Broadcast tests need production-like retention.
function createSyncTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 5 * 60 * 1000, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

const sessionFor = (id: string) => ({
  accessToken: `access-${id}`,
  refreshToken: `refresh-${id}`,
  user: { id, email: `${id}@example.com`, name: id, role: "user" },
});

function renderTab(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <QueryBroadcaster />
    </QueryClientProvider>,
  );
}

describe("query broadcaster", () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: "unauthenticated",
      accessToken: null,
      refreshToken: null,
      user: null,
    });
    useTenantStore.setState({ tenantId: null });
  });

  it("lands fetched data in the sibling tab with a single fetch", async () => {
    useAuthStore.getState().setAuth(sessionFor("u-1") as never);
    useTenantStore.getState().setTenantId(TENANT);
    const clientA = createSyncTestClient();
    const clientB = createSyncTestClient();
    const first = renderTab(clientA);
    const second = renderTab(clientB);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    await clientA.fetchQuery({ queryKey: ["probe", "shared"], queryFn: fetchFn });
    await vi.waitFor(() => expect(clientB.getQueryData(["probe", "shared"])).toEqual({ ok: true }));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });

  it("stays silent while logged out", async () => {
    const clientA = createSyncTestClient();
    const clientB = createSyncTestClient();
    const first = renderTab(clientA);
    const stopListening = broadcastQueryClient({
      queryClient: clientB,
      broadcastChannel: "tanstack-query:u-9:-",
    });
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    await clientA.fetchQuery({ queryKey: ["probe", "quiet"], queryFn: fetchFn });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(clientA.getQueryData(["probe", "quiet"])).toEqual({ ok: true });
    expect(clientB.getQueryData(["probe", "quiet"])).toBeUndefined();
    stopListening();
    first.unmount();
  });

  it("never crosses user identities", async () => {
    const clientA = createSyncTestClient();
    const clientB = createSyncTestClient();
    const stopA = broadcastQueryClient({
      queryClient: clientA,
      broadcastChannel: "tanstack-query:u-1:-",
    });
    const stopB = broadcastQueryClient({
      queryClient: clientB,
      broadcastChannel: "tanstack-query:u-2:-",
    });
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    await clientA.fetchQuery({ queryKey: ["probe", "isolated"], queryFn: fetchFn });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(clientA.getQueryData(["probe", "isolated"])).toEqual({ ok: true });
    expect(clientB.getQueryData(["probe", "isolated"])).toBeUndefined();
    stopA();
    stopB();
  });

  it("stops receiving after unmount", async () => {
    useAuthStore.getState().setAuth(sessionFor("u-3") as never);
    const clientA = createSyncTestClient();
    const clientB = createSyncTestClient();
    const first = renderTab(clientA);
    const second = renderTab(clientB);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    second.unmount();
    await clientA.fetchQuery({ queryKey: ["probe", "gone"], queryFn: fetchFn });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(clientB.getQueryData(["probe", "gone"])).toBeUndefined();
    first.unmount();
  });
});
