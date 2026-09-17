import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PreferenceItem } from "@repo/contracts";
import { toast } from "@repo/ui/components/ui/toast";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useMarkReadMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await getApiClient().notifications.markRead(id);
      if (res.status !== 200) throw new Error("api.notifications.notFound");
      return res.body;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all() });
      const previousNotifications = queryClient.getQueriesData({
        queryKey: queryKeys.notifications.all(),
      });
      const previousUnread = queryClient.getQueryData<number>(
        queryKeys.notifications.unreadCount(),
      );

      const now = new Date().toISOString();
      queryClient.setQueriesData<{ items?: Array<{ id: string; readAt: string | null }> }>(
        { queryKey: queryKeys.notifications.all() },
        (old) => {
          if (!old || !Array.isArray(old.items)) return old;
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === id ? { ...item, readAt: item.readAt ?? now } : item,
            ),
          };
        },
      );

      if (typeof previousUnread === "number" && previousUnread > 0) {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), previousUnread - 1);
      }

      return { previousNotifications, previousUnread };
    },
    onError: (_err, _id, context) => {
      if (context?.previousNotifications) {
        for (const [key, data] of context.previousNotifications) {
          queryClient.setQueryData(key, data);
        }
      }
      if (typeof context?.previousUnread === "number") {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), context.previousUnread);
      }
      toast.add({ title: t("api.notifications.notFound"), type: "error" } as never);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

export function useMarkAllReadMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await getApiClient().notifications.markAllRead();
      if (res.status !== 200) throw new Error("api.notifications.fetchFailed");
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all() });
      const previousNotifications = queryClient.getQueriesData({
        queryKey: queryKeys.notifications.all(),
      });
      const previousUnread = queryClient.getQueryData<number>(
        queryKeys.notifications.unreadCount(),
      );

      const now = new Date().toISOString();
      queryClient.setQueriesData<{ items?: Array<{ id: string; readAt: string | null }> }>(
        { queryKey: queryKeys.notifications.all() },
        (old) => {
          if (!old || !Array.isArray(old.items)) return old;
          return {
            ...old,
            items: old.items.map((item) => ({ ...item, readAt: item.readAt ?? now })),
          };
        },
      );

      queryClient.setQueryData(queryKeys.notifications.unreadCount(), 0);

      return { previousNotifications, previousUnread };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotifications) {
        for (const [key, data] of context.previousNotifications) {
          queryClient.setQueryData(key, data);
        }
      }
      if (typeof context?.previousUnread === "number") {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), context.previousUnread);
      }
      toast.add({ title: t("api.notifications.fetchFailed"), type: "error" } as never);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

export function useUpdatePreferencesMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (preferences: PreferenceItem[]) => {
      const res = await getApiClient().notifications.updatePreferences({ preferences });
      if (res.status !== 200) throw new Error("api.notifications.preferenceInvalid");
      return res.body.preferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences() });
    },
    onError: () =>
      toast.add({ title: t("api.notifications.preferenceInvalid"), type: "error" } as never),
  });
}
