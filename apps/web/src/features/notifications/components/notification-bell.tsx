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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { notificationsListQuery, unreadCountQuery } from "../notifications.queries";
import { useMarkAllReadMutation } from "../notifications.mutations";

export function NotificationBell() {
  const { t } = useTranslation();
  const countQuery = useQuery(unreadCountQuery());
  const recentQuery = useQuery(notificationsListQuery(1, 5));
  const markAllRead = useMarkAllReadMutation();
  const count = countQuery.data ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("notifications.title")}
            className="relative"
          />
        }
      >
        <Bell className="size-4" />
        {count > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("notifications.title")}</span>
          {count > 0 && (
            <button
              type="button"
              className="text-xs font-normal text-primary hover:underline"
              onClick={() => markAllRead.mutate()}
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(recentQuery.data?.items ?? []).slice(0, 5).map((item) => (
          <DropdownMenuItem key={item.id} className="flex-col items-start gap-1">
            <span className="text-sm font-medium">{t(item.titleKey)}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleString()}
            </span>
          </DropdownMenuItem>
        ))}
        {(recentQuery.data?.items.length ?? 0) === 0 && (
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            {t("notifications.noNotifications")}
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="justify-center">
          <Link to={FRONTEND_ROUTES.notifications} className="text-sm text-primary">
            {t("notifications.viewAll")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
