import { queryOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useTenantStore } from "@/stores/tenant.store";

export function usersListQuery(page = 1, limit = 20) {
  const tenantId = useTenantStore.getState().tenantId;
  return queryOptions({
    queryKey: queryKeys.users.list(tenantId, page, limit),
    queryFn: async () => {
      const client = getApiClient();
      const res = await client.users.list({ query: { page, limit } });
      if (res.status !== 200) throw new Error("errors.networkError", { cause: res.error });
      return res.body;
    },
  });
}
