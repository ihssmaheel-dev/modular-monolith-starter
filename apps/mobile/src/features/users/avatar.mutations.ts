import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AVATAR_MAX_FILE_SIZE_BYTES, AVATAR_MIME_TYPES } from "@repo/contracts";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { useUploadFileMutation, type NativeUploadItem } from "@/features/files/files.mutations";

/** Self-serve profile avatar (mirrors web): upload image, then link as avatar slot. */
export function useAttachAvatarMutation() {
  const queryClient = useQueryClient();
  const upload = useUploadFileMutation();
  return useMutation({
    mutationFn: async (item: NativeUploadItem) => {
      const allowed = (AVATAR_MIME_TYPES as readonly string[]).includes(item.contentType);
      if (!allowed || item.fileSize <= 0 || item.fileSize > AVATAR_MAX_FILE_SIZE_BYTES) {
        throw new Error("api.user.invalidAvatar");
      }
      const uploaded = await upload.mutateAsync(item);
      const response = await getApiClient().users.attachAvatar({ fileId: uploaded.id });
      if (response.status !== 201) throw new Error("api.error.uploadFailed");
      return response.body;
    },
    onSuccess: (user) => {
      useAuthStore.getState().setUser(user);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useRemoveAvatarMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await getApiClient().users.removeAvatar();
      if (response.status !== 200) throw new Error("api.error.deleteFailed");
      return response.body;
    },
    onSuccess: (user) => {
      useAuthStore.getState().setUser(user);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
