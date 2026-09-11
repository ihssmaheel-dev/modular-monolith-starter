import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@repo/ui/components/ui/toast";
import { uploadFile, type UploadBody } from "@repo/api-client";
import { getApiClient } from "@/lib/api";

export function putBytesWithProgress(
  url: string,
  body: UploadBody | undefined,
  contentType: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  if (!body) return Promise.reject(new Error("api.error.invalidRequest"));
  // Normalize to XHR-sendable bytes: a generic Uint8Array is not an
  // ArrayBufferView<ArrayBuffer>, so copy it into ArrayBuffer backing.
  const payload = body instanceof Blob || body instanceof ArrayBuffer ? body : new Uint8Array(body);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`PUT failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("PUT network error"));
    xhr.send(payload);
  });
}

export interface UploadQueueItem {
  file: File;
  onProgress: (ratio: number) => void;
}

/** Generic upload pipeline: presigned URL → PUT bytes → confirm. */
export function useUploadFileMutation() {
  return useMutation({
    mutationFn: async ({ file, onProgress }: UploadQueueItem) => {
      const uploaded = await uploadFile(
        getApiClient().files,
        { fileName: file.name, contentType: file.type, fileSize: file.size, body: file },
        (url, body, contentType) => putBytesWithProgress(url, body, contentType, onProgress),
      );
      return uploaded;
    },
  });
}

/** Note attachment: upload then link to the note (ownership verified server-side). */
export function useAttachNoteFileMutation(noteId: string, slot?: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const upload = useUploadFileMutation();
  return useMutation({
    mutationFn: async ({ file, onProgress }: UploadQueueItem) => {
      const uploaded = await upload.mutateAsync({ file, onProgress });
      const response = await getApiClient().notes.attach(noteId, uploaded.id, slot);
      if (response.status !== 201) throw new Error("api.error.uploadFailed");
      return response.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: () => toast.add({ title: t("api.error.uploadFailed"), type: "error" } as never),
  });
}

export function useDeleteFileMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await getApiClient().files.delete({ params: { id } });
      if (response.status !== 204) throw new Error("api.error.deleteFailed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.add({ title: t("files.deleted"), type: "success" } as never);
    },
    onError: () => toast.add({ title: t("api.error.deleteFailed"), type: "error" } as never),
  });
}

export async function downloadFileById(id: string, fileName: string): Promise<void> {
  const res = await getApiClient().files.getDownloadUrl({ params: { id } });
  if (res.status !== 200 || !res.body) throw new Error("api.error.internal");
  const anchor = document.createElement("a");
  anchor.href = res.body.downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
