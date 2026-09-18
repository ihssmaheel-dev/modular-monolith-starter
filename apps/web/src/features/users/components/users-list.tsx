import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Users as UsersIcon } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { DataTable, DataTablePagination } from "@repo/ui/components/composed/data-table";
import { EmptyState } from "@repo/ui/components/composed/empty-state";
import { PageHeader } from "@repo/ui/components/composed/page-header";
import { usersListQuery } from "@/features/users/users.queries";
import { getUsersColumns } from "@/features/users/components/users-table-columns";

export function UsersList({
  page,
  limit,
  onPageChange,
}: {
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const usersQuery = useQuery({ ...usersListQuery(page, limit) });
  const columns = getUsersColumns(t);

  return (
    <div className="w-full space-y-3.5">
      <PageHeader
        title={t("users.title")}
        description={t("users.description")}
        badge={
          <Badge variant="secondary" className="font-mono text-xs">
            {usersQuery.data?.total ?? "—"} {t("common.items")}
          </Badge>
        }
      />

      {usersQuery.isLoading ? (
        <div className="h-44 animate-pulse rounded-md bg-muted/50" />
      ) : usersQuery.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-xs sm:text-sm text-destructive flex items-center justify-between">
          <span>{t("errors.networkError")}</span>
          <Button variant="outline" size="sm" onClick={() => usersQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : usersQuery.data?.users.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="size-6" />}
          title={t("users.noUsers")}
          description={t("users.description")}
        />
      ) : (
        <div className="space-y-2.5">
          <DataTable
            data={usersQuery.data?.users ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            isLoading={usersQuery.isFetching}
            emptyText={t("common.noResults")}
          />
          {usersQuery.data && usersQuery.data.totalPages > 1 && (
            <DataTablePagination
              page={page}
              totalPages={usersQuery.data.totalPages}
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
