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

export function userAvatarQuery(avatarFileId: string | null | undefined) {
  return queryOptions({
    queryKey: queryKeys.users.avatar(avatarFileId),
    queryFn: async () => {
      if (!avatarFileId) return null;
      const res = await getApiClient().files.getDownloadUrl({
        params: { id: avatarFileId },
      });
      if (res.status !== 200 || !res.body) throw new Error("api.error.internal");
      return res.body.downloadUrl;
    },
    enabled: Boolean(avatarFileId),
    staleTime: 5 * 60 * 1000,
  });
}
