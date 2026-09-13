import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ProfileCard } from "@/features/users/components/profile-card";
import { AccountSecurityCard } from "@/features/settings/components/account-security-card";
import { ThemeCard } from "@/features/settings/components/theme-card";
import { PreferencesCard } from "@/features/notifications/components/preferences-card";
import { EmailChangeCard } from "@/features/users/components/email-change-card";
import { ExportCard } from "@/features/privacy/components/export-card";
import { EraseAccountCard } from "@/features/privacy/components/erase-account-card";
import { EraseOrganizationCard } from "@/features/privacy/components/erase-organization-card";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">{t("settings.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.description")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ProfileCard />
        <AccountSecurityCard />
      </div>
      <PreferencesCard />
      <EmailChangeCard />
      <ExportCard />
      <EraseAccountCard />
      <EraseOrganizationCard />
      <ThemeCard />
    </div>
  );
}
