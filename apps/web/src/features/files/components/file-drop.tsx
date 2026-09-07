import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudUpload, FileWarning } from "lucide-react";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import { Progress } from "@repo/ui/components/ui/progress";
import { cn } from "@repo/ui/lib/utils";

export interface QueuedUpload {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  errorKey?: string;
  file?: File;
}

interface FileDropProps {
  accept?: readonly string[];
  maxSizeBytes?: number;
  multiple?: boolean;
  upload: (file: File, onProgress: (ratio: number) => void) => Promise<unknown>;
  onUploaded?: (count: number) => void;
}

function validateFile(file: File, accept: readonly string[], maxSizeBytes: number): string | null {
  if (!(accept as readonly string[]).includes(file.type)) return "api.error.invalidRequest";
  if (file.size <= 0 || file.size > maxSizeBytes) return "api.error.fileTooLarge";
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
  multiple = true,
  upload,
  onUploaded,
}: FileDropProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueuedUpload[]>([]);

  const patch = useCallback((key: string, update: Partial<QueuedUpload>) => {
    setQueue((current) =>
      current.map((item) => (item.key === key ? { ...item, ...update } : item)),
    );
  }, []);

  const enqueue = useCallback(
    async (files: File[]) => {
      const fresh: QueuedUpload[] = files.map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
        size: file.size,
        progress: 0,
        status: "queued" as const,
        file,
      }));
      setQueue((current) => [...current, ...fresh]);
      let done = 0;
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]!;
        const row = fresh[i]!;
        const errorKey = validateFile(file, accept, maxSizeBytes);
        if (errorKey) {
          patch(row.key, { status: "error", errorKey });
          continue;
        }
        patch(row.key, { status: "uploading" });
        try {
          await upload(file, (ratio) => patch(row.key, { progress: ratio }));
          patch(row.key, { status: "done", progress: 1 });
          done += 1;
        } catch (error) {
          patch(row.key, { status: "error", errorKey: toUploadErrorKey(error) });
        }
      }
      if (done > 0) onUploaded?.(done);
    },
    [accept, maxSizeBytes, upload, onUploaded, patch],
  );

  const retry = useCallback(
    async (key: string) => {
      const row = queue.find((item) => item.key === key);
      if (!row?.file) return;
      patch(key, { status: "uploading", progress: 0, errorKey: undefined });
      try {
        await upload(row.file, (ratio) => patch(key, { progress: ratio }));
        patch(key, { status: "done", progress: 1 });
        onUploaded?.(1);
      } catch (error) {
        patch(key, { status: "error", errorKey: toUploadErrorKey(error) });
      }
    },
    [queue, upload, onUploaded, patch],
  );

  const hasFinished = queue.some((item) => item.status === "done" || item.status === "error");
  const clearFinished = useCallback(() => {
    setQueue((current) =>
      current.filter((item) => item.status !== "done" && item.status !== "error"),
    );
  }, []);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void enqueue(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-muted" : "border-border hover:border-primary/50",
        )}
      >
        <CloudUpload className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">{t("files.dropFiles")}</span>
        <span className="text-xs text-muted-foreground">{t("files.browseHint")}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept.join(",")}
        onChange={(e) => {
          void enqueue(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((item) => (
            <li key={item.key} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{item.name}</span>
                {item.status === "error" ? (
                  <span className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <FileWarning className="size-3.5" />
                      {t(item.errorKey ?? "api.error.uploadFailed")}
                    </span>
                    {item.file && (
                      <Button variant="ghost" size="sm" onClick={() => void retry(item.key)}>
                        {t("files.retry")}
                      </Button>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {item.status === "done" ? t("files.uploaded") : t("files.uploading")}
                  </span>
                )}
              </div>
              {item.status !== "error" && (
                <Progress value={Math.round(item.progress * 100)} className="mt-2" />
              )}
            </li>
          ))}
        </ul>
      )}
      {hasFinished && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={clearFinished}>
            {t("files.clearFinished")}
          </Button>
        </div>
      )}
    </div>
  );
}
