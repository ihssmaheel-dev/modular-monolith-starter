import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FRONTEND_ROUTES } from "@repo/contracts";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@repo/ui/components/ui/command";
import {
  Bell,
  FilePlus2,
  FileText,
  Laptop,
  LayoutDashboard,
  Moon,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAuthStore } from "@/stores/auth.store";
import { getWebEnv } from "@/lib/env";

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const user = useAuthStore((state) => state.user);
  const { VITE_EXAMPLE_FEATURES_ENABLED: examplesEnabled } = getWebEnv();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const runCommand = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const isAdmin = user?.role === "admin";

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("navigation.commandPalette")}
      description={t("navigation.searchCommands")}
    >
      <CommandInput placeholder={t("navigation.searchCommands")} />
      <CommandList>
        <CommandEmpty>{t("common.noResults")}</CommandEmpty>

        <CommandGroup heading={t("navigation.workspace")}>
          {examplesEnabled && (
            <CommandItem
              onSelect={() => runCommand(() => navigate({ to: FRONTEND_ROUTES.dashboard }))}
            >
              <LayoutDashboard className="mr-2 size-4" />
              <span>{t("dashboard.title")}</span>
            </CommandItem>
          )}

          {examplesEnabled && (
            <CommandItem onSelect={() => runCommand(() => navigate({ to: FRONTEND_ROUTES.notes }))}>
              <FileText className="mr-2 size-4" />
              <span>{t("notes.title")}</span>
            </CommandItem>
          )}

          {examplesEnabled && (
            <CommandItem
              onSelect={() => runCommand(() => navigate({ to: FRONTEND_ROUTES.newNote }))}
            >
              <FilePlus2 className="mr-2 size-4" />
              <span>{t("notes.newNote")}</span>
            </CommandItem>
          )}

          <CommandItem
            onSelect={() => runCommand(() => navigate({ to: FRONTEND_ROUTES.notifications }))}
          >
            <Bell className="mr-2 size-4" />
            <span>{t("notifications.title")}</span>
          </CommandItem>

          <CommandItem
            onSelect={() => runCommand(() => navigate({ to: FRONTEND_ROUTES.settings }))}
          >
            <Settings className="mr-2 size-4" />
            <span>{t("settings.title")}</span>
          </CommandItem>

          {isAdmin && (
            <CommandItem onSelect={() => runCommand(() => navigate({ to: FRONTEND_ROUTES.users }))}>
              <Users className="mr-2 size-4" />
              <span>{t("users.title")}</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("navigation.actions")}>
          <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
            <Sun className="mr-2 size-4" />
            <span>{t("navigation.themeLight")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
            <Moon className="mr-2 size-4" />
            <span>{t("navigation.themeDark")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
            <Laptop className="mr-2 size-4" />
            <span>{t("navigation.themeSystem")}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
