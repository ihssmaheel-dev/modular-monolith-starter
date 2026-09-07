import * as React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@repo/contracts";
import { Button } from "./button";

export interface QueuedNativeUpload {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  errorKey?: string;
  input?: { uri: string; fileName: string; contentType: string; fileSize: number };
}

interface FileDropProps {
  accept?: readonly string[];
  maxSizeBytes?: number;
  upload: (
    item: { uri: string; fileName: string; contentType: string; fileSize: number },
    onProgress: (ratio: number) => void,
  ) => Promise<unknown>;
  onUploaded?: (count: number) => void;
}

function validatePicked(
  asset: { name?: string | null; mimeType?: string | null; size?: number | null },
  accept: readonly string[],
  maxSizeBytes: number,
): string | null {
  if (!asset.mimeType || !(accept as readonly string[]).includes(asset.mimeType)) {
    return "api.error.invalidRequest";
  }
  if (!asset.size || asset.size <= 0 || asset.size > maxSizeBytes) return "api.error.fileTooLarge";
  return null;
}

const UPLOAD_ERROR_KEYS = new Set([
  "api.error.invalidRequest",
  "api.error.fileTooLarge",
  "api.error.quotaExceeded",
  "api.file.metadataMismatch",
]);

function toUploadErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (UPLOAD_ERROR_KEYS.has(message)) return message;
  return "api.error.uploadFailed";
}

export function FileDrop({
  accept = ALLOWED_MIME_TYPES,
  maxSizeBytes = MAX_FILE_SIZE_BYTES,
  upload,
  onUploaded,
}: FileDropProps) {
  const { t } = useTranslation();
  const [queue, setQueue] = React.useState<QueuedNativeUpload[]>([]);
  const [picking, setPicking] = React.useState(false);

  const patch = React.useCallback((key: string, update: Partial<QueuedNativeUpload>) => {
    setQueue((current) =>
      current.map((item) => (item.key === key ? { ...item, ...update } : item)),
    );
  }, []);

  const pick = React.useCallback(async () => {
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...accept],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets) return;
      const fresh: QueuedNativeUpload[] = result.assets.map((asset, index) => ({
        key: `${Date.now()}-${index}-${asset.name ?? "file"}`,
        name: asset.name ?? "file",
        size: asset.size ?? 0,
        progress: 0,
        status: "queued" as const,
        input: {
          uri: asset.uri,
          fileName: asset.name ?? "file",
          contentType: asset.mimeType ?? "application/octet-stream",
          fileSize: asset.size ?? 0,
        },
      }));
      setQueue((current) => [...current, ...fresh]);
      let done = 0;
      for (let i = 0; i < result.assets.length; i += 1) {
        const asset = result.assets[i]!;
        const row = fresh[i]!;
        const errorKey = validatePicked(asset, accept, maxSizeBytes);
        if (errorKey || !asset.mimeType || !asset.size) {
          patch(row.key, { status: "error", errorKey: errorKey ?? "api.error.invalidRequest" });
          continue;
        }
        patch(row.key, { status: "uploading" });
        try {
          await upload(
            {
              uri: asset.uri,
              fileName: asset.name ?? "file",
              contentType: asset.mimeType,
              fileSize: asset.size,
            },
            (ratio) => patch(row.key, { progress: ratio }),
          );
          patch(row.key, { status: "done", progress: 1 });
          done += 1;
        } catch (error) {
          patch(row.key, { status: "error", errorKey: toUploadErrorKey(error) });
        }
      }
      if (done > 0) onUploaded?.(done);
    } finally {
      setPicking(false);
    }
  }, [accept, maxSizeBytes, upload, onUploaded, patch]);

  const retry = React.useCallback(
    async (key: string) => {
      const row = queue.find((item) => item.key === key);
      if (!row?.input) return;
      patch(key, { status: "uploading", progress: 0, errorKey: undefined });
      try {
        await upload(row.input, (ratio) => patch(key, { progress: ratio }));
        patch(key, { status: "done", progress: 1 });
        onUploaded?.(1);
      } catch (error) {
        patch(key, { status: "error", errorKey: toUploadErrorKey(error) });
      }
    },
    [queue, upload, onUploaded, patch],
  );

  return (
    <View className="gap-3">
      <Button variant="outline" loading={picking} onPress={() => void pick()}>
        {t("files.pickFiles")}
      </Button>
      {queue.map((item) => (
        <View key={item.key} className="gap-1 rounded-lg border border-border p-3">
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
            {item.name}
          </Text>
          {item.status === "error" ? (
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-xs text-destructive">
                {t(item.errorKey ?? "api.error.uploadFailed")}
              </Text>
              {item.input && (
                <Button variant="ghost" size="sm" onPress={() => void retry(item.key)}>
                  {t("files.retry")}
                </Button>
              )}
            </View>
          ) : (
            <Text className="text-xs text-muted-foreground">
              {item.status === "done" ? t("files.uploaded") : `${Math.round(item.progress * 100)}%`}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
