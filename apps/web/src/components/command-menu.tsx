import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@repo/ui/components/ui/command";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAuthStore } from "@/stores/auth.store";
import { getWebEnv } from "@/lib/env";
import { NAVIGATION_CONFIG, filterNavItems } from "@/config/navigation.config";

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

        {NAVIGATION_CONFIG.map((section) => {
          const visibleItems = filterNavItems(section.items, { isAdmin, examplesEnabled });
          if (visibleItems.length === 0) return null;

          return (
            <CommandGroup key={section.id} heading={t(section.titleKey)}>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    onSelect={() => runCommand(() => navigate({ to: item.to }))}
                  >
                    <Icon className="mr-2 size-4" />
                    <span>{t(item.titleKey)}</span>
                  </CommandItem>
                );
              })}
              {visibleItems
                .filter((item) => item.createAction)
                .map((item) => {
                  const action = item.createAction!;
                  const CreateIcon = action.icon;
                  return (
                    <CommandItem
                      key={`${item.id}-create`}
                      onSelect={() => runCommand(() => navigate({ to: action.to }))}
                    >
                      <CreateIcon className="mr-2 size-4" />
                      <span>{t(action.titleKey)}</span>
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          );
        })}

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
