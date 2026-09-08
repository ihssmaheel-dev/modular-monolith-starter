import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PreferenceItem } from "@repo/contracts";
import { toast } from "@/components/ui/toast";
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
    onError: () => toast.add({ title: t("api.notifications.notFound") }),
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
    onError: () => toast.add({ title: t("api.notifications.fetchFailed") }),
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
    onError: () => toast.add({ title: t("api.notifications.preferenceInvalid") }),
  });
}

export function useRegisterDeviceMutation() {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (input: { platform: "ios" | "android" | "web"; token: string }) => {
      const res = await getApiClient().notifications.registerDevice({
        platform: input.platform,
        provider: "expo",
        token: input.token,
      });
      if (res.status !== 201) throw new Error("api.notifications.deviceInvalid");
      return res.body;
    },
    onError: () => toast.add({ title: t("api.notifications.deviceInvalid") }),
  });
}
