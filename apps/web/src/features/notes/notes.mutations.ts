import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { CreateNoteDto, NoteResponseDto } from "@repo/contracts";
import { toast } from "@repo/ui/components/ui/toast";
import { getApiClient } from "@/lib/api";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.add({ title: t("api.note.deleted"), type: "success" } as never);
    },
    onError: () => toast.add({ title: t("api.note.deleteFailed"), type: "error" } as never),
  });
}
