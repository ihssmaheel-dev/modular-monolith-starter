import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { ConfirmDialog } from "@repo/ui/components/composed/confirm-dialog";
import { DataTableColumnHeader } from "@repo/ui/components/composed/data-table";
import type { DataTableColumn, DataTableFeatures } from "@repo/ui/components/composed/data-table";
import { formatDate } from "@/lib/format";

export type NoteRow = { id: string; title: string; content: string; createdAt: string };

const columnHelper = createColumnHelper<DataTableFeatures, NoteRow>();

export function getNotesColumns(
  t: (key: string, opts?: Record<string, unknown>) => string,
  onDelete: (id: string) => void,
): DataTableColumn<NoteRow>[] {
  return columnHelper.columns([
    columnHelper.accessor("title", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("notes.noteTitle")} />
      ),
      cell: (info) => (
        <Link
          to="/notes/$noteId"
          params={{ noteId: info.row.original.id }}
          className="inline-flex items-center gap-2 font-medium text-foreground hover:text-primary transition-colors"
        >
          <FileText className="size-3.5 text-muted-foreground/70 shrink-0" />
          <span className="truncate">{info.getValue()}</span>
        </Link>
      ),
    }),
    columnHelper.accessor("content", {
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("notes.content")} />,
      cell: (info) => <span className="line-clamp-2 text-muted-foreground">{info.getValue()}</span>,
      enableSorting: false,
    }),
    columnHelper.accessor("createdAt", {
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.created")} />,
      cell: (info) => (
        <span className="text-xs text-muted-foreground">{formatDate(info.getValue())}</span>
      ),
      meta: { className: "hidden sm:table-cell" },
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: (info) => {
        const row = info.row.original;
        return (
          <ConfirmDialog
            title={t("common.delete")}
            description={t("notes.deleteConfirm", { title: row.title })}
            confirmText={t("common.delete")}
            cancelText={t("common.cancel")}
            pendingText={t("common.saving")}
            variant="destructive"
            onConfirm={() => onDelete(row.id)}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")}>
                <Trash2 className="size-3.5" />
              </Button>
            }
          />
        );
      },
      meta: { className: "w-12" },
    }),
  ]);
}
