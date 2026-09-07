import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Paperclip } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { noteByIdQuery, noteAttachmentsQuery } from "@/features/notes/notes.queries";
import {
  downloadFileById,
  useAttachNoteFileMutation,
  useDeleteFileMutation,
} from "@/features/files/files.mutations";
import { FileDrop } from "@/features/files/components/file-drop";
import { AttachmentList } from "@/features/files/components/attachment-list";

const SCAN_POLL_MS = 3000;

export function NoteDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goBack = () => navigate({ to: FRONTEND_ROUTES.notes });
  const noteQuery = useQuery(noteByIdQuery(id));
  const attachmentsQuery = useQuery({
    ...noteAttachmentsQuery(id),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const pending = items.some((item) => item.status !== "uploaded" && item.status !== "failed");
      return pending ? SCAN_POLL_MS : false;
    },
  });
  const attachMutation = useAttachNoteFileMutation(id);
  const deleteMutation = useDeleteFileMutation();

  if (noteQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }
  if (noteQuery.isError || !noteQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="size-4" />
          {t("common.back")}
        </Button>
        <p className="text-sm text-destructive">{t("api.note.notFound")}</p>
      </div>
    );
  }

  const note = noteQuery.data;
  const files = attachmentsQuery.data?.items ?? [];

  return (
    <div className="w-full space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="size-4" />
          {t("common.back")}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{note.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{note.content}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="size-4" />
            {t("files.attachments")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AttachmentList
            files={files}
            isDeleting={deleteMutation.isPending}
            onDownload={(file) => void downloadFileById(file.id, file.fileName)}
            onDelete={(fileId) => deleteMutation.mutate(fileId)}
          />
          <FileDrop
            upload={(file, onProgress) => attachMutation.mutateAsync({ file, onProgress })}
            onUploaded={() => void attachmentsQuery.refetch()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
