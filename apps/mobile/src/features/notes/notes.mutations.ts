import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateNoteDto, NoteResponseDto } from "@repo/contracts";
import { getApiClient } from "@/lib/api";

export function useCreateNoteMutation(opts?: { onSuccess?: (note: NoteResponseDto) => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateNoteDto) => {
      const response = await getApiClient().notes.create({ body: data });
      if (response.status !== 201) throw new Error("api.note.createFailed");
      return response.body;
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      opts?.onSuccess?.(note);
    },
  });
}

export function useDeleteNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await getApiClient().notes.remove(id);
      if (response.status !== 204) throw new Error("api.note.deleteFailed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
