import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { DataTablePagination } from "@repo/ui/components/composed/data-table";
import { EmptyState } from "@repo/ui/components/composed/empty-state";
import { PageHeader } from "@repo/ui/components/composed/page-header";
import { cn } from "@repo/ui/lib/utils";
import { notificationsListQuery } from "../notifications.queries";
import { useMarkAllReadMutation, useMarkReadMutation } from "../notifications.mutations";

export function NotificationsFeed({
  page,
  limit,
  onPageChange,
}: {
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const feedQuery = useQuery({ ...notificationsListQuery(page, limit) });
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();
  const items = feedQuery.data?.items ?? [];

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.description")}
        actions={
          <Button
            variant="outline"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            {t("notifications.markAllRead")}
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-2 pt-6">
          {feedQuery.isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<BellRing className="size-8" />}
              title={t("notifications.noNotifications")}
              description={t("notifications.description")}
            />
          ) : (
            <>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => !item.readAt && markRead.mutate(item.id)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left",
                    !item.readAt && "border-primary/40 bg-muted/40",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t(item.titleKey)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!item.readAt && <Badge variant="secondary">{t("notifications.unread")}</Badge>}
                </button>
              ))}
              {feedQuery.data && feedQuery.data.totalPages > 1 && (
                <DataTablePagination
                  page={page}
                  totalPages={feedQuery.data.totalPages}
                  onPageChange={onPageChange}
                  pageLabel={(current, total) =>
                    t("common.pageOf", { page: current, totalPages: total })
                  }
                  previousLabel={t("common.previous")}
                  nextLabel={t("common.next")}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
