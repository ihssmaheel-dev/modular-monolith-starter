import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Monitor, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useAuthStore } from "@/stores/auth.store";
import { useTheme } from "@/components/theme-provider";
import { ExportCard } from "@/features/privacy/components/export-card";
import { EmailChangeCard } from "@/features/users/components/email-change-card";
import { EraseAccountCard } from "@/features/privacy/components/erase-account-card";
import { EraseOrganizationCard } from "@/features/privacy/components/erase-organization-card";
import { PreferencesCard } from "@/features/notifications/components/preferences-card";
import { AvatarUpload } from "@/features/users/components/avatar-upload";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { theme, setTheme } = useTheme();
  const modes = [
    { value: "light" as const, label: t("settings.lightMode"), icon: Sun },
    { value: "dark" as const, label: t("settings.darkMode"), icon: Moon },
    { value: "system" as const, label: t("settings.systemDefault"), icon: Monitor },
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">{t("settings.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.description")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
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
      </div>
      <PreferencesCard />
      <EmailChangeCard />
      <ExportCard />
      <EraseAccountCard />
      <EraseOrganizationCard />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance")}</CardTitle>
          <CardDescription>{t("settings.appearanceDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3">
            {modes.map((mode) => (
              <Button
                key={mode.value}
                variant={theme === mode.value ? "default" : "outline"}
                className="justify-start gap-2"
                onClick={() => setTheme(mode.value)}
              >
                <mode.icon className="size-4" />
                {mode.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
