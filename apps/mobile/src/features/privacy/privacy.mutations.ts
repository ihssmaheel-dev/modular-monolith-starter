import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";

export function useRequestExportMutation(opts?: { onSuccess?: (id: string) => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await getApiClient().privacy.requestExport();
      if (response.status !== 200) throw new Error("api.privacy.exportFailed");
      return response.body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["privacy"] });
      opts?.onSuccess?.(data.id);
    },
  });
}

export function useEraseAccountMutation(opts?: { onSuccess?: () => void }) {
  return useMutation({
    mutationFn: async (password: string) => {
      const response = await getApiClient().privacy.requestAccountErasure({ password });
      if (response.status !== 201) throw new Error("api.privacy.erasureFailed");
      return response.body;
    },
    onSuccess: () => {
      opts?.onSuccess?.();
    },
  });
}

export function useEraseOrganizationMutation() {
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
    },
  });
}
