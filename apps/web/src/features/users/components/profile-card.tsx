import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useAuthStore } from "@/stores/auth.store";
import { AvatarUpload } from "./avatar-upload";

export function ProfileCard() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4" />
          {t("settings.profile")}
        </CardTitle>
        <CardDescription>{t("settings.accountSecurityDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AvatarUpload />
        <div>
          <p className="text-xs text-muted-foreground">{t("common.name")}</p>
          <p className="font-medium">{user?.name}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("settings.emailAddress")}</p>
          <p className="font-medium">{user?.email}</p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("settings.authRole")}</span>
          <Badge variant="secondary">{user?.role}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
