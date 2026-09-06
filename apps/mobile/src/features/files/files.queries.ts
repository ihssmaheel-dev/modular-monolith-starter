import { queryOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useTenantStore } from "@/stores/tenant.store";

export function filesListQuery(parentType: "note" | "user" | "general", parentId?: string) {
  const tenantId = useTenantStore.getState().tenantId;
  return queryOptions({
    queryKey: queryKeys.files.list(tenantId, parentType, parentId),
    queryFn: async () => {
      const res = await getApiClient().files.listByParent({
        query: { parentType, parentId, limit: 100 },
      });
      if (res.status !== 200) throw new Error("api.error.internal");
      return res.body;
    },
  });
}
