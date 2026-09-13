import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { getApiClient } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";
import { unregisterPushDevice } from "@/lib/push";
import { useTenantStore } from "@/stores/tenant.store";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { PreferencesCard } from "@/features/notifications/components/preferences-card";
import { UserProfileCard } from "@/features/users/components/user-profile-card";
import { LanguageCard } from "@/features/settings/components/language-card";
import { AppearanceCard } from "@/features/settings/components/appearance-card";
import { PrivacyCard } from "@/features/privacy/components/privacy-card";

export default function Settings() {
  const { t } = useTranslation();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const signOut = async () => {
    try {
      await getApiClient().auth.logout();
    } finally {
      await unregisterPushDevice();
      getQueryClient().clear();
      useTenantStore.getState().setTenantId(null);
      clearAuth();
      router.replace("/(auth)/login");
    }
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View>
        <Text className="text-sm font-medium text-foreground">{t("settings.eyebrow")}</Text>
        <Text className="mt-1 text-2xl font-bold text-foreground">{t("settings.title")}</Text>
        <Text className="mt-1 text-sm text-muted-foreground">{t("settings.description")}</Text>
      </View>

      <UserProfileCard />
      <LanguageCard />
      <AppearanceCard />
      <PreferencesCard />
      <PrivacyCard onAccountErased={signOut} />

      <Button variant="outline" onPress={signOut}>
        <Text className="text-center font-semibold text-destructive">{t("auth.logout")}</Text>
      </Button>
    </ScrollView>
  );
}
