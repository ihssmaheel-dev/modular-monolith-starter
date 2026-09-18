import { useTranslation } from "react-i18next";
import { PageHeader } from "@repo/ui/components/composed/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { ProfileCard } from "@/features/users/components/profile-card";
import { AccountSecurityCard } from "@/features/settings/components/account-security-card";
import { ThemeCard } from "@/features/settings/components/theme-card";
import { LanguageCard } from "@/features/settings/components/language-card";
import { PreferencesCard } from "@/features/notifications/components/preferences-card";
import { EmailChangeCard } from "@/features/users/components/email-change-card";
import { ExportCard } from "@/features/privacy/components/export-card";
import { EraseAccountCard } from "@/features/privacy/components/erase-account-card";
import { EraseOrganizationCard } from "@/features/privacy/components/erase-organization-card";

export function SettingsView() {
  const { t } = useTranslation();

  return (
    <div className="w-full space-y-3.5">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
        eyebrow={t("settings.eyebrow")}
      />

      <Tabs defaultValue="general" className="w-full space-y-3.5">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex h-8.5 rounded-md p-0.5">
          <TabsTrigger value="general" className="text-xs px-3">
            {t("settings.tabGeneral")}
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs px-3">
            {t("settings.tabSecurity")}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs px-3">
            {t("settings.tabNotifications")}
          </TabsTrigger>
          <TabsTrigger value="privacy" className="text-xs px-3">
            {t("settings.tabPrivacy")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-3.5">
          <div className="grid gap-3.5 lg:grid-cols-2">
            <ProfileCard />
            <div className="space-y-3.5">
              <ThemeCard />
              <LanguageCard />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-3.5 max-w-3xl">
          <AccountSecurityCard />
          <EmailChangeCard />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-3.5 max-w-3xl">
          <PreferencesCard />
        </TabsContent>

        <TabsContent value="privacy" className="space-y-3.5 max-w-3xl">
          <ExportCard />
          <EraseAccountCard />
          <EraseOrganizationCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
