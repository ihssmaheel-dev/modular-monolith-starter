import { queryOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function tenancyStatusQuery() {
  return queryOptions({
    queryKey: queryKeys.tenancy.status(),
    queryFn: async () => {
      const client = getApiClient();
      const res = await client.tenancy.status();
      if (res.status !== 200 || !res.body) {
        throw new Error("errors.networkError", { cause: res.error });
      }
      return res.body;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function organizationsListQuery(page = 1, limit = 50) {
  return queryOptions({
    queryKey: [...queryKeys.tenancy.organizations(), { page, limit }] as const,
    queryFn: async () => {
      const client = getApiClient();
      const res = await client.tenancy.listOrganizations({ query: { page, limit } });
      if (res.status !== 200 || !res.body) {
        throw new Error("errors.networkError", { cause: res.error });
      }
      return res.body;
    },
    staleTime: 60 * 1000,
  });
}
