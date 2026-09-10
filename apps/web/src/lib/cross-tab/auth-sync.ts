import type { AuthResponse } from "@repo/contracts";
import { getQueryClient } from "@/lib/query-client";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { createBroadcastChannel, type BroadcastHandle } from "./channel";

export const AUTH_SYNC_CHANNEL = "app:auth";

export type AuthSyncEvent =
  { type: "signed-out"; userId: string | null } | { type: "signed-in"; response: AuthResponse };

let publishChannel: BroadcastHandle<AuthSyncEvent> | null = null;

function channel(): BroadcastHandle<AuthSyncEvent> {
  if (!publishChannel) publishChannel = createBroadcastChannel<AuthSyncEvent>(AUTH_SYNC_CHANNEL);
  return publishChannel;
}

/**
 * The single local sign-out teardown. Used by the header action and by the
 * cross-tab receiver alike, so every tab ends in exactly the same state.
 */
export function signOutLocally(): void {
  getQueryClient().clear();
  useTenantStore.getState().setTenantId(null);
  useAuthStore.getState().clearAuth();
}

export function publishSignedOut(userId: string | null): void {
  channel().post({ type: "signed-out", userId });
}

export function publishSignedIn(response: AuthResponse): void {
  channel().post({ type: "signed-in", response });
}

/**
 * Subscribes this tab to auth events from sibling tabs. Safe to call once per
 * mount (StrictMode/HMR via the returned cleanup); never touches the network.
 */
export function initAuthSync(options: { onSignedOut: () => void }): () => void {
  const handle = createBroadcastChannel<AuthSyncEvent>(AUTH_SYNC_CHANNEL);
  const unsubscribe = handle.subscribe((message) => {
    if (message.type === "signed-out") {
      const currentId = useAuthStore.getState().user?.id ?? null;
      // Foreign users must never clear this tab; an already-signed-out tab
      // has nothing to do.
      if (message.userId !== null && currentId !== null && message.userId !== currentId) return;
      if (currentId === null && message.userId === null) return;
      signOutLocally();
      options.onSignedOut();
    } else if (message.type === "signed-in") {
      // Only adopt a session when logged out — never overwrite a live one.
      if (!useAuthStore.getState().user) useAuthStore.getState().setAuth(message.response);
    }
  });
  return () => {
    unsubscribe();
    handle.close();
  };
}
