import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { DataTable, DataTablePagination } from "@repo/ui/components/composed/data-table";
import { EmptyState } from "@repo/ui/components/composed/empty-state";
import { PageHeader } from "@repo/ui/components/composed/page-header";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { notesListQuery } from "@/features/notes/notes.queries";
import { useDeleteNoteMutation } from "@/features/notes/notes.mutations";
import { getNotesColumns } from "@/features/notes/components/notes-table-columns";

export function NotesList({
  page,
  limit,
  onPageChange,
}: {
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const notesQuery = useQuery({ ...notesListQuery(page, limit) });
  const deleteMutation = useDeleteNoteMutation();
  const columns = getNotesColumns(t, (id) => deleteMutation.mutate(id));

  return (
    <div className="w-full space-y-3.5">
      <PageHeader
        title={t("notes.title")}
        description={t("notes.description")}
        eyebrow={t("notes.eyebrow")}
        badge={
          <Badge variant="secondary" className="font-mono text-xs">
            {notesQuery.data?.total ?? "—"} {t("common.items")}
          </Badge>
        }
        actions={
          <Button
            render={<Link to={FRONTEND_ROUTES.newNote} />}
            size="sm"
            className="gap-1.5 shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>{t("notes.newNote")}</span>
          </Button>
        }
      />

      {notesQuery.isLoading ? (
        <div className="h-44 animate-pulse rounded-md bg-muted/50" />
      ) : notesQuery.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-xs sm:text-sm text-destructive flex items-center justify-between">
          <span>{t("api.note.fetchFailed")}</span>
          <Button variant="outline" size="sm" onClick={() => notesQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : notesQuery.data?.items.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title={t("notes.noNotes")}
          description={t("notes.description")}
          action={
            <Button render={<Link to={FRONTEND_ROUTES.newNote} />} size="sm">
              <Plus className="size-4" />
              {t("notes.createNote")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          <DataTable
            data={notesQuery.data?.items ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            isLoading={notesQuery.isFetching}
            emptyText={t("common.noResults")}
          />
          {notesQuery.data && notesQuery.data.totalPages > 1 && (
            <DataTablePagination
              page={page}
              totalPages={notesQuery.data.totalPages}
              onPageChange={onPageChange}
              pageLabel={(current, total) =>
                t("common.pageOf", { page: current, totalPages: total })
              }
              previousLabel={t("common.previous")}
              nextLabel={t("common.next")}
            />
          )}
        </div>
      )}
    </div>
  );
}
