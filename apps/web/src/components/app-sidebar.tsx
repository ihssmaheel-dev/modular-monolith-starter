import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { Bell, FilePlus2, FileText, LayoutDashboard, Layers3, Users } from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@repo/ui/components/ui/sidebar";

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();

  const isNotesActive = location.pathname.startsWith("/notes");

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex h-12 items-center gap-2.5 px-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-xs">
            <Layers3 className="size-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-bold text-sidebar-foreground">
              {t("common.appName")}
            </p>
            <p className="truncate text-[10px] text-sidebar-foreground/60 uppercase tracking-wider font-mono">
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

              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to={FRONTEND_ROUTES.notes} />}
                  isActive={isNotesActive}
                  tooltip={t("notes.title")}
                >
                  <FileText />
                  <span>{t("notes.title")}</span>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      render={<Link to={FRONTEND_ROUTES.notes} />}
                      isActive={location.pathname === "/notes"}
                    >
                      <FileText className="size-3.5" />
                      <span>{t("notes.title")}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      render={<Link to={FRONTEND_ROUTES.newNote} />}
                      isActive={location.pathname === "/notes/new"}
                    >
                      <FilePlus2 className="size-3.5" />
                      <span>{t("notes.newNote")}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>

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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
