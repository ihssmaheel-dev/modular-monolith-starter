import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { formatDateTime } from "@/lib/format";
import { notificationsListQuery, unreadCountQuery } from "../notifications.queries";
import { useMarkAllReadMutation } from "../notifications.mutations";

const MAX_BADGE = 99;

export function NotificationBell() {
  const { t } = useTranslation();
  const countQuery = useQuery(unreadCountQuery());
  const recentQuery = useQuery(notificationsListQuery(1, 5));
  const markAllRead = useMarkAllReadMutation();
  const count = countQuery.data ?? 0;
  const items = recentQuery.data?.items ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("notifications.title")}
            className="relative"
          >
            <Bell className="size-4" />
            {count > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]"
              >
                {count > MAX_BADGE ? `${MAX_BADGE}+` : count}
              </Badge>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1 text-xs font-medium text-muted-foreground">
          <span>{t("notifications.title")}</span>
          {count > 0 && (
            <button
              type="button"
              className="text-xs font-normal text-primary hover:underline disabled:opacity-50"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {recentQuery.isLoading ? (
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
        ) : recentQuery.isError ? (
          <div className="px-1.5 py-1 text-xs font-normal text-destructive">
            {t("api.notifications.fetchFailed")}{" "}
            <button type="button" className="underline" onClick={() => recentQuery.refetch()}>
              {t("common.retry")}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-1.5 py-1 text-xs font-normal text-muted-foreground">
            {t("notifications.noNotifications")}
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.id} className="flex-col items-start gap-1">
              <span className="text-sm font-medium">
                {t(item.titleKey, (item.titleParams as Record<string, string> | null) ?? {})}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(item.createdAt)}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to={FRONTEND_ROUTES.notifications} />}>
          <span className="w-full text-center text-sm text-primary">
            {t("notifications.viewAll")}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
