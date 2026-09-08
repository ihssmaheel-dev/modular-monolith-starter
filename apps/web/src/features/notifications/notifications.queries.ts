import { queryOptions } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const UNREAD_POLL_MS = 60_000;

export function notificationsListQuery(page = 1, limit = 20) {
  return queryOptions({
    queryKey: queryKeys.notifications.list(page, limit),
    queryFn: async () => {
      const res = await getApiClient().notifications.list({ query: { page, limit } });
      if (res.status !== 200) throw new Error("api.notifications.fetchFailed");
      return res.body;
    },
  });
}

export function unreadCountQuery() {
  return queryOptions({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => {
      const res = await getApiClient().notifications.unreadCount();
      if (res.status !== 200) throw new Error("api.notifications.fetchFailed");
      return res.body.count;
    },
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function preferencesQuery() {
  return queryOptions({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: async () => {
      const res = await getApiClient().notifications.getPreferences();
      if (res.status !== 200) throw new Error("api.notifications.fetchFailed");
      return res.body.preferences;
    },
  });
}
