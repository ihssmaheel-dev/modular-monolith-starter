import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PreferenceItem } from "@repo/contracts";
import { getApiClient } from "@/lib/api";

export function useMarkReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await getApiClient().notifications.markRead(id);
      if (res.status !== 200) throw new Error("api.notifications.notFound");
      return res.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await getApiClient().notifications.markAllRead();
      if (res.status !== 200) throw new Error("api.notifications.notFound");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useUpdatePreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (preferences: PreferenceItem[]) => {
      const res = await getApiClient().notifications.updatePreferences({ preferences });
      if (res.status !== 200) throw new Error("api.notifications.preferenceInvalid");
      return res.body.preferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRegisterDeviceMutation() {
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
  });
}
