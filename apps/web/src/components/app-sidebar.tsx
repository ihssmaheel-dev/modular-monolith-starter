import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { Bell, FileText, LayoutDashboard, Layers3, Settings, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/ui/components/ui/sidebar";
import { useAuthStore } from "@/stores/auth.store";
import { getWebEnv } from "@/lib/env";

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { VITE_APP_NAME: appName, VITE_EXAMPLE_FEATURES_ENABLED: examplesEnabled } = getWebEnv();

  const isNotesActive = location.pathname.startsWith("/notes");
  const isAdmin = user?.role === "admin";

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-12 border-b border-sidebar-border p-0 justify-center">
        <div className="flex h-12 items-center gap-2.5 px-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-xs">
            <Layers3 className="size-3.5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-semibold text-sidebar-foreground leading-none">
              {appName}
            </p>
            <p className="truncate text-[9px] text-sidebar-foreground/60 uppercase tracking-wider font-mono mt-0.5">
              {t("navigation.platform")}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("navigation.workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {examplesEnabled && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to={FRONTEND_ROUTES.dashboard} />}
                    isActive={location.pathname === "/dashboard"}
                    tooltip={t("dashboard.title")}
                  >
                    <LayoutDashboard />
                    <span>{t("dashboard.title")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {examplesEnabled && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to={FRONTEND_ROUTES.notes} />}
                    isActive={isNotesActive}
                    tooltip={t("notes.title")}
                  >
                    <FileText />
                    <span>{t("notes.title")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to={FRONTEND_ROUTES.users} />}
                    isActive={location.pathname.startsWith("/users")}
                    tooltip={t("users.title")}
                  >
                    <Users />
                    <span>{t("users.title")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to={FRONTEND_ROUTES.notifications} />}
                  isActive={location.pathname.startsWith("/notifications")}
                  tooltip={t("notifications.title")}
                >
                  <Bell />
                  <span>{t("notifications.title")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to={FRONTEND_ROUTES.settings} />}
                  isActive={location.pathname.startsWith("/settings")}
                  tooltip={t("settings.title")}
                >
                  <Settings />
                  <span>{t("settings.title")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
