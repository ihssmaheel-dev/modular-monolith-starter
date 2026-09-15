import { useEffect, useRef } from "react";
import { TenantIdSchema } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { createBroadcastChannel, type BroadcastHandle } from "./channel";
import { scopedChannel } from "./sync";

export const TENANT_SYNC_CHANNEL = "app:tenant";
export type TenantSyncEvent = { type: "tenant-changed"; tenantId: string | null };

export function TenantSync() {
  const userId = useAuthStore((state) => state.user?.id);
  const tenantId = useTenantStore((state) => state.tenantId);
  const mounted = useRef(false);
  const channelRef = useRef<BroadcastHandle<TenantSyncEvent> | null>(null);

  useEffect(() => {
    if (!userId) return;
    const channel = createBroadcastChannel<TenantSyncEvent>(
      scopedChannel(TENANT_SYNC_CHANNEL, { userId }),
    );
    channelRef.current = channel;
    const unsubscribe = channel.subscribe((message) => {
      const valid = message.tenantId === null || TenantIdSchema.safeParse(message.tenantId).success;
      if (message.type === "tenant-changed" && valid) {
        useTenantStore.getState().setTenantId(message.tenantId);
      }
    });
    return () => {
      channelRef.current = null;
      unsubscribe();
      channel.close();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !mounted.current) {
      mounted.current = true;
      return;
    }
    channelRef.current?.post({ type: "tenant-changed", tenantId });
  }, [tenantId, userId]);

  return null;
}
