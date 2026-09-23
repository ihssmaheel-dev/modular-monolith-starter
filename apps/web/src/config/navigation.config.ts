import type { ComponentType } from "react";
import { Bell, FilePlus2, FileText, LayoutDashboard, Settings, Users } from "lucide-react";
import { FRONTEND_ROUTES } from "@repo/contracts";

export interface NavAction {
  titleKey: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
}

export interface NavItem {
  id: string;
  titleKey: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  adminOnly?: boolean;
  requiresExamples?: boolean;
  createAction?: NavAction;
}

export interface NavSection {
  id: string;
  titleKey: string;
  items: NavItem[];
}

export const NAVIGATION_CONFIG: readonly NavSection[] = [
  {
    id: "workspace",
    titleKey: "navigation.workspace",
    items: [
      {
        id: "dashboard",
        titleKey: "dashboard.title",
        to: FRONTEND_ROUTES.dashboard,
        icon: LayoutDashboard,
        exact: true,
        requiresExamples: true,
      },
      {
        id: "notes",
        titleKey: "notes.title",
        to: FRONTEND_ROUTES.notes,
        icon: FileText,
        requiresExamples: true,
        createAction: {
          titleKey: "notes.newNote",
          to: FRONTEND_ROUTES.newNote,
          icon: FilePlus2,
        },
      },
      {
        id: "users",
        titleKey: "users.title",
        to: FRONTEND_ROUTES.users,
        icon: Users,
        adminOnly: true,
      },
      {
        id: "notifications",
        titleKey: "notifications.title",
        to: FRONTEND_ROUTES.notifications,
        icon: Bell,
      },
      {
        id: "settings",
        titleKey: "settings.title",
        to: FRONTEND_ROUTES.settings,
        icon: Settings,
      },
    ],
  },
] as const;

export interface FilterNavOptions {
  isAdmin?: boolean;
  examplesEnabled?: boolean;
}

export function filterNavItems(items: readonly NavItem[], options: FilterNavOptions): NavItem[] {
  return items.filter((item) => {
    if (item.adminOnly && !options.isAdmin) return false;
    if (item.requiresExamples && !options.examplesEnabled) return false;
    return true;
  });
}
