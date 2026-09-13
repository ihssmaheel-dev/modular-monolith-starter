import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export function AccountSecurityCard() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          {t("settings.accountSecurity")}
        </CardTitle>
        <CardDescription>{t("settings.accountSecurityDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{t("settings.activeTenant")}</p>
            <p className="text-xs text-muted-foreground">{t("tenancy.activeOrganization")}</p>
          </div>
          <Badge variant="outline">{t("settings.systemDefault")}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
