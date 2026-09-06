import { useTranslation } from "react-i18next";
import { Download, FileText, Trash2 } from "lucide-react";
import type { FileMetadataResponse } from "@repo/contracts";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { ConfirmDialog } from "@repo/ui/components/composed/confirm-dialog";

const STATUS_LABELS: Record<FileMetadataResponse["status"], string> = {
  pending: "files.status.pending",
  uploading: "files.status.uploading",
  scanning: "files.status.scanning",
  uploaded: "files.status.uploaded",
  failed: "files.status.failed",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface AttachmentListProps {
  files: FileMetadataResponse[];
  onDownload: (file: FileMetadataResponse) => void;
  onDelete: (id: string) => void;
  isDeleting?: boolean;
}

export function AttachmentList({ files, onDownload, onDelete, isDeleting }: AttachmentListProps) {
  const { t } = useTranslation();
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("files.noAttachments")}</p>;
  }
  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.id} className="flex items-center gap-3 rounded-lg border p-3">
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.fileSize)}
              {file.slot ? ` · ${file.slot}` : ""}
            </p>
          </div>
          {file.status !== "uploaded" && (
            <Badge variant="secondary">{t(STATUS_LABELS[file.status])}</Badge>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("files.download")}
            onClick={() => onDownload(file)}
          >
            <Download className="size-3.5" />
          </Button>
          <ConfirmDialog
            title={t("common.delete")}
            description={t("files.deleteConfirm", { name: file.fileName })}
            confirmText={t("common.delete")}
            cancelText={t("common.cancel")}
            pendingText={t("common.saving")}
            variant="destructive"
            onConfirm={() => onDelete(file.id)}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.delete")}
                disabled={isDeleting}
              >
                <Trash2 className="size-3.5" />
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
