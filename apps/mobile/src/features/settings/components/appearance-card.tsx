import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { useThemeStore } from "@/stores/theme.store";

export function AppearanceCard() {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeStore();

  const modes = [
    { value: "light" as const, label: t("settings.lightMode") },
    { value: "dark" as const, label: t("settings.darkMode") },
    { value: "system" as const, label: t("settings.systemDefault") },
  ];

  return (
    <Card>
      <Text className="text-base font-bold text-foreground">{t("settings.appearance")}</Text>
      <Text className="mt-1 text-xs text-muted-foreground">
        {t("settings.appearanceDescription")}
      </Text>
      <View className="mt-3 flex-row gap-2">
        {modes.map((mode) => (
          <Pressable
            key={mode.value}
            onPress={() => setTheme(mode.value)}
            className={`rounded-lg border px-4 py-2 ${theme === mode.value ? "bg-primary border-primary" : "border-border"}`}
          >
            <Text
              className={`text-sm font-medium capitalize ${theme === mode.value ? "text-primary-foreground" : "text-foreground"}`}
            >
              {mode.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
