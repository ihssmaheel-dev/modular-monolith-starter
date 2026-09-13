import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type Locale } from "@repo/i18n";
import { Card } from "@/components/ui/card";
import { useLocaleStore } from "@/stores/locale.store";
import { applyLocale } from "@/lib/i18n";

export function LanguageCard() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocaleStore();

  const changeLocale = (next: Locale) => {
    setLocale(next);
    applyLocale(next);
  };

  return (
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
  );
}
