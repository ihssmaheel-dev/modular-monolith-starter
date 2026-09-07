import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type Locale } from "@repo/i18n";
import { getApiClient } from "@/lib/api";
import { applyLocale } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth.store";
import { useLocaleStore } from "@/stores/locale.store";
import { useThemeStore, type Theme } from "@/stores/theme.store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRequestExportMutation, useEraseAccountMutation } from "@/features/privacy/privacy.mutations";
import { AvatarUpload } from "@/features/users/components/avatar-upload";

export default function Settings() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { locale, setLocale } = useLocaleStore();
  const { theme, setTheme } = useThemeStore();

  const changeLocale = (next: Locale) => {
    setLocale(next);
    applyLocale(next);
  };

  const signOut = async () => {
    try {
      await getApiClient().auth.logout();
    } finally {
      clearAuth();
      router.replace("/(auth)/login");
    }
  };

  const [erasePassword, setErasePassword] = useState("");
  const exportMutation = useRequestExportMutation();
  const eraseMutation = useEraseAccountMutation({
    onSuccess: () => {
      clearAuth();
      router.replace("/(auth)/login");
    },
  });

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View>
        <Text className="text-sm font-medium text-foreground">{t("settings.eyebrow")}</Text>
        <Text className="mt-1 text-2xl font-bold text-foreground">{t("settings.title")}</Text>
        <Text className="mt-1 text-sm text-muted-foreground">{t("settings.description")}</Text>
      </View>

      <Card>
        <Text className="text-base font-bold text-foreground">{t("settings.profile")}</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {t("settings.accountSecurityDescription")}
        </Text>
        <View className="mt-4 gap-3">
          <AvatarUpload />
          <View>
            <Text className="text-xs text-muted-foreground">{t("common.name")}</Text>
            <Text className="font-medium text-foreground">{user?.name}</Text>
          </View>
          <View>
            <Text className="text-xs text-muted-foreground">{t("settings.emailAddress")}</Text>
            <Text className="font-medium text-foreground">{user?.email}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">{t("settings.authRole")}</Text>
            <Text className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
              {user?.role}
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text className="text-base font-bold text-foreground">{t("settings.language")}</Text>
        <View className="mt-3 flex-row gap-2">
          {SUPPORTED_LOCALES.map((lng) => (
            <Pressable
              key={lng}
              onPress={() => changeLocale(lng)}
              className={`rounded-lg border px-4 py-2 ${locale === lng ? "bg-primary border-primary" : "border-border"}`}
            >
              <Text
                className={`text-sm font-medium ${locale === lng ? "text-primary-foreground" : "text-foreground"}`}
              >
                {lng.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <Text className="text-base font-bold text-foreground">Appearance</Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          Light / Dark / System — mirrors web ThemeProvider
        </Text>
        <View className="mt-3 flex-row gap-2">
          {(["light", "dark", "system"] as Theme[]).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setTheme(mode)}
              className={`rounded-lg border px-4 py-2 ${theme === mode ? "bg-primary border-primary" : "border-border"}`}
            >
              <Text
                className={`text-sm font-medium capitalize ${theme === mode ? "text-primary-foreground" : "text-foreground"}`}
              >
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <Text className="text-base font-bold text-foreground">{t("privacy.title")}</Text>
        <Text className="mt-1 text-xs text-muted-foreground">{t("privacy.description")}</Text>
        <View className="mt-3 gap-2">
          <Button
            variant="outline"
            loading={exportMutation.isPending}
            onPress={() => exportMutation.mutate()}
          >
            {t("privacy.requestExport")}
          </Button>
          <Input
            secureTextEntry
            autoComplete="password"
            placeholder={t("privacy.confirmPassword")}
            value={erasePassword}
            onChangeText={setErasePassword}
          />
          <Button
            variant="destructive"
            loading={eraseMutation.isPending}
            disabled={!erasePassword}
            onPress={() => eraseMutation.mutate(erasePassword)}
          >
            {t("privacy.eraseAccount")}
          </Button>
        </View>
      </Card>

      <Button variant="outline" onPress={signOut}>
        <Text className="text-center font-semibold text-destructive">{t("auth.logout")}</Text>
      </Button>
    </ScrollView>
  );
}
