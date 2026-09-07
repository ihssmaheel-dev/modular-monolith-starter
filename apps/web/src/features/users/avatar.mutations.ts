import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@repo/ui/components/ui/toast";
import { uploadFile } from "@repo/api-client";
import { AVATAR_MAX_FILE_SIZE_BYTES, AVATAR_MIME_TYPES } from "@repo/contracts";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { putBytesWithProgress, type UploadQueueItem } from "@/features/files/files.mutations";

function toErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "api.user.invalidAvatar") return message;
  return "api.error.uploadFailed";
}

export function useAttachAvatarMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, onProgress }: UploadQueueItem) => {
      const allowed = (AVATAR_MIME_TYPES as readonly string[]).includes(file.type);
      if (!allowed || file.size <= 0 || file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
        throw new Error("api.user.invalidAvatar");
      }
      const uploaded = await uploadFile(
        getApiClient().files,
        { fileName: file.name, contentType: file.type, fileSize: file.size, body: file },
        (url, body, contentType) => putBytesWithProgress(url, body, contentType, onProgress),
      );
      const response = await getApiClient().users.attachAvatar({ fileId: uploaded.id });
      if (response.status !== 201) throw new Error(toErrorKey(response.error));
      return response.body;
    },
    onSuccess: (user) => {
      useAuthStore.getState().setUser(user);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.add({ title: t("users.avatarUpdated"), type: "success" } as never);
    },
    onError: (error) => toast.add({ title: t(toErrorKey(error)), type: "error" } as never),
  });
}

export function useRemoveAvatarMutation() {
  const { t } = useTranslation();
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
      toast.add({ title: t("users.avatarRemoved"), type: "success" } as never);
    },
    onError: () => toast.add({ title: t("api.error.deleteFailed"), type: "error" } as never),
  });
}
