import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";

export function DashboardHeader() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {t("dashboard.welcome", { name: user?.name ?? t("common.user") })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5 text-xs shadow-xs"
          render={<Link to={FRONTEND_ROUTES.newNote} />}
        >
          <Plus className="size-3.5" />
          <span>{t("notes.newNote")}</span>
        </Button>
      </div>
    </div>
  );
}
