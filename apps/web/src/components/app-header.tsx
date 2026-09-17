import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, LogOut, Moon, Search, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@repo/ui/components/ui/avatar";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { SidebarTrigger } from "@repo/ui/components/ui/sidebar";
import { useAuthStore } from "@/stores/auth.store";
import { getApiClient } from "@/lib/api";
import { publishSignedOut, signOutLocally } from "@/lib/cross-tab/auth-sync";
import { useTheme } from "@/components/theme-provider";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { OrganizationSwitcher } from "@/features/tenancy/components/organization-switcher";
import { CommandMenu } from "@/components/command-menu";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { getWebEnv } from "@/lib/env";

export function AppHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const appName = getWebEnv().VITE_APP_NAME;
  const initials = user?.name?.slice(0, 2).toUpperCase() ?? "U";

  const signOut = async () => {
    setSigningOut(true);
    const signedOutUserId = user?.id ?? null;
    try {
      await getApiClient().auth.logout();
    } finally {
      signOutLocally();
      publishSignedOut(signedOutUserId);
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
          <span>{appName}</span>
          <ChevronRight className="size-3" />
          <span className="font-medium text-foreground">{currentPage}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCommandOpen(true)}
          className="hidden h-8 w-44 items-center justify-between px-2 text-xs text-muted-foreground md:flex"
          aria-label={t("navigation.commandPalette")}
        >
          <span className="flex items-center gap-1.5">
            <Search className="size-3.5" />
            <span>{t("common.search")}...</span>
          </span>
          <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-[10px]">⌘</span>K
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCommandOpen(true)}
          className="size-8 md:hidden"
          aria-label={t("navigation.commandPalette")}
        >
          <Search className="size-4" />
        </Button>
        <OrganizationSwitcher />
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
            <DropdownMenuGroup>
              <DropdownMenuLabel className="space-y-1">
                <p className="font-medium text-sm text-foreground">{user?.name}</p>
                <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
                <Badge variant="secondary" className="mt-1 text-[10px] font-mono">
                  {user?.role}
                </Badge>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
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
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
    </header>
  );
}
