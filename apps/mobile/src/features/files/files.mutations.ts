import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Linking } from "react-native";
import { File } from "expo-file-system";
import { uploadFile } from "@repo/api-client";
import { getApiClient } from "@/lib/api";

const UPLOAD_TRANSFER_TIMEOUT_MS = 60_000;

export async function putBytesNative(url: string, fileUri: string, contentType: string) {
  const body = await new File(fileUri).bytes();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TRANSFER_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: body as unknown as BodyInit,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("api.error.uploadFailed");
  } finally {
    clearTimeout(timeout);
  }
}

export interface NativeUploadItem {
  uri: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  onProgress: (ratio: number) => void;
}

/** Generic upload pipeline (mirrors web): presigned URL → PUT bytes → confirm. */
export function useUploadFileMutation() {
  return useMutation({
    mutationFn: async ({ uri, fileName, contentType, fileSize, onProgress }: NativeUploadItem) => {
      onProgress(0);
      const uploaded = await uploadFile(
        getApiClient().files,
        { fileName, contentType, fileSize },
        async (url, _body, type) => {
          await putBytesNative(url, uri, type);
          onProgress(1);
        },
      );
      return uploaded;
    },
  });
}

/** Note attachment: upload then link to the note (ownership verified server-side). */
export function useAttachNoteFileMutation(noteId: string, slot?: string) {
  const queryClient = useQueryClient();
  const upload = useUploadFileMutation();
  return useMutation({
    mutationFn: async (item: NativeUploadItem) => {
      const uploaded = await upload.mutateAsync(item);
      const response = await getApiClient().notes.attach(noteId, uploaded.id, slot);
      if (response.status !== 201) throw new Error("api.error.uploadFailed");
      return response.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}

export function useDeleteFileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await getApiClient().files.delete({ params: { id } });
      if (response.status !== 204) throw new Error("api.error.deleteFailed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}

export async function openFileDownload(id: string): Promise<void> {
  const res = await getApiClient().files.getDownloadUrl({ params: { id } });
  if (res.status !== 200 || !res.body) throw new Error("api.error.internal");
  await Linking.openURL(res.body.downloadUrl);
}
