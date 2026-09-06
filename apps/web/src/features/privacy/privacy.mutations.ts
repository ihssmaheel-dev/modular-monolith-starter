import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@repo/ui/components/ui/toast";
import { getApiClient } from "@/lib/api";

export function useRequestExportMutation(opts?: { onSuccess?: (id: string) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await getApiClient().privacy.requestExport();
      if (response.status !== 200) throw new Error("api.privacy.exportFailed");
      return response.body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["privacy"] });
      toast.add({ title: t("privacy.exportReady"), type: "success" } as never);
      opts?.onSuccess?.(data.id);
    },
    onError: () => toast.add({ title: t("api.privacy.exportFailed"), type: "error" } as never),
  });
}

export function useEraseAccountMutation(opts?: { onSuccess?: () => void }) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (password: string) => {
      const response = await getApiClient().privacy.requestAccountErasure({ password });
      if (response.status !== 201) throw new Error("api.privacy.erasureFailed");
      return response.body;
    },
    onSuccess: () => {
      toast.add({ title: t("privacy.erasureScheduled"), type: "success" } as never);
      opts?.onSuccess?.();
    },
    onError: () => toast.add({ title: t("api.privacy.erasureFailed"), type: "error" } as never),
  });
}

export function useEraseOrganizationMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { organizationId: string; confirmationName: string }) => {
      const response = await getApiClient().privacy.requestOrganizationErasure(
        input.organizationId,
        { confirmationName: input.confirmationName },
      );
      if (response.status !== 201) throw new Error("api.privacy.erasureFailed");
      return response.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privacy"] });
      toast.add({ title: t("privacy.erasureScheduled"), type: "success" } as never);
    },
    onError: () => toast.add({ title: t("api.privacy.erasureFailed"), type: "error" } as never),
  });
}
