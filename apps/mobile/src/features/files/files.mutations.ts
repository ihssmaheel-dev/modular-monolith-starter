import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Linking } from "react-native";
import * as FileSystem from "expo-file-system";
import { uploadFile } from "@repo/api-client";
import { getApiClient } from "@/lib/api";

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64_CHARS.indexOf(clean[i] ?? "=");
    const b = BASE64_CHARS.indexOf(clean[i + 1] ?? "=");
    const c = BASE64_CHARS.indexOf(clean[i + 2] ?? "=");
    const d = BASE64_CHARS.indexOf(clean[i + 3] ?? "=");
    const triple = (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63);
    bytes.push((triple >> 16) & 255);
    if (c !== 64) bytes.push((triple >> 8) & 255);
    if (d !== 64) bytes.push(triple & 255);
  }
  return new Uint8Array(bytes);
}

export async function putBytesNative(url: string, fileUri: string, contentType: string) {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const body = base64ToBytes(base64);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: body as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`PUT failed with status ${res.status}`);
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
