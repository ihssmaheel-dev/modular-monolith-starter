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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
    onError: () => toast.add({ title: t("api.notifications.notFound"), type: "error" } as never),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
    onError: () => toast.add({ title: t("api.notifications.fetchFailed"), type: "error" } as never),
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
