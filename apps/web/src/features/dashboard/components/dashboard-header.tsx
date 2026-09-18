import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { PageHeader } from "@repo/ui/components/composed/page-header";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { getWebEnv } from "@/lib/env";

export function DashboardHeader() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { VITE_APP_NAME: appName, VITE_EXAMPLE_FEATURES_ENABLED: examplesEnabled } = getWebEnv();

  return (
    <PageHeader
      title={t("dashboard.welcome", { name: user?.name ?? t("common.user") })}
      description={t("dashboard.subtitle", { appName })}
      actions={
        examplesEnabled ? (
          <Button
            size="sm"
            className="gap-1.5 text-xs shadow-xs"
            render={<Link to={FRONTEND_ROUTES.newNote} />}
          >
            <Plus className="size-3.5" />
            <span>{t("notes.newNote")}</span>
          </Button>
        ) : undefined
      }
    />
  );
}
