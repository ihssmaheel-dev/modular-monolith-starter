import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Layers3 } from "lucide-react";
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
import { NAVIGATION_CONFIG, filterNavItems } from "@/config/navigation.config";

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { VITE_APP_NAME: appName, VITE_EXAMPLE_FEATURES_ENABLED: examplesEnabled } = getWebEnv();

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
        {NAVIGATION_CONFIG.map((section) => {
          const visibleItems = filterNavItems(section.items, { isAdmin, examplesEnabled });
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={section.id}>
              <SidebarGroupLabel>{t(section.titleKey)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.exact
                      ? location.pathname === item.to
                      : location.pathname.startsWith(item.to);

                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          render={<Link to={item.to} />}
                          isActive={isActive}
                          tooltip={t(item.titleKey)}
                        >
                          <Icon />
                          <span>{t(item.titleKey)}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
