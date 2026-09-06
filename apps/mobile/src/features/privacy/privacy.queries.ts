import { queryOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function privacyRequestsQuery(page = 1, limit = 20) {
  return queryOptions({
    queryKey: queryKeys.privacy.requests(page, limit),
    queryFn: async () => {
      const res = await getApiClient().privacy.listRequests({ page, limit });
      if (res.status !== 200) throw new Error("api.privacy.exportFailed");
      return res.body;
    },
  });
}
