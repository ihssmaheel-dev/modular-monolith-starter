import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { CreateNoteDto, NoteResponseDto } from "@repo/contracts";
import { toast } from "@repo/ui/components/ui/toast";
import { getApiClient } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useTenantStore } from "@/stores/tenant.store";

export function useCreateNoteMutation(opts?: { onSuccess?: (note: NoteResponseDto) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateNoteDto) => {
      const response = await getApiClient().notes.create({ body: data });
      if (response.status !== 201) throw new Error("api.note.createFailed");
      return response.body;
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.add({ title: t("api.note.created"), type: "success" } as never);
      opts?.onSuccess?.(note);
    },
    onError: () => toast.add({ title: t("api.note.createFailed"), type: "error" } as never),
  });
}

export function useDeleteNoteMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await getApiClient().notes.remove(id);
      if (response.status !== 204) throw new Error("api.note.deleteFailed");
    },
    onMutate: async (deletedId: string) => {
      const tenantId = useTenantStore.getState().tenantId;
      await queryClient.cancelQueries({ queryKey: queryKeys.notes.all(tenantId) });

      const previousNotes = queryClient.getQueriesData({
        queryKey: queryKeys.notes.all(tenantId),
      });

      queryClient.setQueriesData<{ items?: Array<{ id: string }>; total?: number }>(
        { queryKey: queryKeys.notes.all(tenantId) },
        (old) => {
          if (!old || !Array.isArray(old.items)) return old;
          return {
            ...old,
            items: old.items.filter((note) => note.id !== deletedId),
            total: typeof old.total === "number" ? Math.max(0, old.total - 1) : old.total,
          };
        },
      );

      return { previousNotes };
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previousNotes) {
        for (const [key, data] of context.previousNotes) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.add({ title: t("api.note.deleteFailed"), type: "error" } as never);
    },
    onSuccess: () => {
      toast.add({ title: t("api.note.deleted"), type: "success" } as never);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
