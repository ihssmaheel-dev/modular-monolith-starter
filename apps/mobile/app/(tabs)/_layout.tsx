import { Redirect, Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth.store";
import { unreadCountQuery } from "@/features/notifications/notifications.queries";

export default function TabsLayout() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const { data: unread } = useQuery({
    ...unreadCountQuery(),
    enabled: status === "authenticated",
  });

  if (status !== "authenticated") return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: t("dashboard.title") }} />
      <Tabs.Screen name="notes" options={{ title: t("notes.title") }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: t("notifications.title"), tabBarBadge: unread ? unread : undefined }}
      />
      <Tabs.Screen name="users" options={{ title: t("users.title") }} />
      <Tabs.Screen name="settings" options={{ title: t("settings.title") }} />
    </Tabs>
  );
}
