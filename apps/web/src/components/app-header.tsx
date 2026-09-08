import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, LogOut, Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@repo/ui/components/ui/avatar";
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
import { SidebarTrigger } from "@repo/ui/components/ui/sidebar";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";
import { getApiClient } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";
import { useTheme } from "@/components/theme-provider";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { FRONTEND_ROUTES } from "@repo/contracts";

export function AppHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const clearTenant = useTenantStore((state) => state.setTenantId);
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const initials = user?.name?.slice(0, 2).toUpperCase() ?? "U";

  const signOut = async () => {
    setSigningOut(true);
    try {
      await getApiClient().auth.logout();
    } finally {
      getQueryClient().clear();
      clearTenant(null);
      clearAuth();
      navigate({ to: FRONTEND_ROUTES.auth });
      setSigningOut(false);
    }
  };

  useRealtimeNotifications();

  const cycleTheme = () =>
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");

  const currentPage = location.pathname.startsWith("/users")
    ? t("users.title")
    : location.pathname.startsWith("/notes/new")
      ? t("notes.newNote")
      : location.pathname.startsWith("/notes")
        ? t("notes.title")
        : location.pathname.startsWith("/notifications")
          ? t("notifications.title")
          : location.pathname.startsWith("/settings")
            ? t("settings.title")
            : t("dashboard.title");

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b bg-background/90 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger aria-label={t("navigation.toggleSidebar")} />
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <span>{t("common.appName")}</span>
          <ChevronRight className="size-3" />
          <span className="font-medium text-foreground">{currentPage}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label={t("settings.switchTheme", {
            theme: theme === "dark" ? t("settings.lightMode") : t("settings.darkMode"),
          })}
        >
          {theme === "dark" ? (
            <Sun className="size-4 text-amber-400" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-9 gap-2 px-2"
                aria-label={t("settings.profile")}
              />
            }
          >
            <Avatar size="sm">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
              {user?.name}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-1">
              <p className="font-medium text-sm text-foreground">{user?.name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
              <Badge variant="secondary" className="mt-1 text-[10px] font-mono">
                {user?.role}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              disabled={signingOut}
              variant="destructive"
              className="cursor-pointer"
            >
              <LogOut className="size-4" />
              <span>{signingOut ? t("auth.signingOut") : t("auth.logout")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
