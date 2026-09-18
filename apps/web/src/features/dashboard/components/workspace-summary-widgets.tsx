import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { useTenantStore } from "@/stores/tenant.store";

export function WorkspaceStatusWidget() {
  const { t } = useTranslation();
  const tenantId = useTenantStore((state) => state.tenantId);

  return (
    <Card className="border-border/80 bg-card shadow-2xs hover:border-primary/40 transition-colors">
      <CardHeader className="p-4 pb-1.5 space-y-0.5">
        <CardDescription className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{t("tenancy.organization")}</span>
          <Building2 className="size-3.5 text-primary" />
        </CardDescription>
        <CardTitle className="text-lg font-semibold tracking-tight text-foreground truncate">
          {tenantId ? tenantId.slice(0, 12) : t("settings.systemDefault")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] font-mono py-0 h-4.5">
          {tenantId ? t("settings.enabled") : t("settings.systemDefault")}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1 px-1.5"
          render={<Link to={FRONTEND_ROUTES.settings} />}
        >
          <span>{t("settings.title")}</span>
          <ArrowRight className="size-3" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function UserStatusWidget() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  return (
    <Card className="border-border/80 bg-card shadow-2xs hover:border-primary/40 transition-colors">
      <CardHeader className="p-4 pb-1.5 space-y-0.5">
        <CardDescription className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{t("settings.accountSecurity")}</span>
          <ShieldCheck className="size-3.5 text-primary" />
        </CardDescription>
        <CardTitle className="text-lg font-semibold tracking-tight text-foreground capitalize truncate">
          {user?.role ?? "User"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground truncate max-w-32">{user?.email}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1 px-1.5"
          render={<Link to={FRONTEND_ROUTES.settings} />}
        >
          <span>{t("settings.profile")}</span>
          <ArrowRight className="size-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
