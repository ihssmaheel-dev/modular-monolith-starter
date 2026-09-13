import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth.store";
import { AvatarUpload } from "@/features/users/components/avatar-upload";

export function UserProfileCard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  return (
    <Card>
      <Text className="text-base font-bold text-foreground">{t("settings.profile")}</Text>
      <Text className="mt-1 text-xs text-muted-foreground">
        {t("settings.accountSecurityDescription")}
      </Text>
      <View className="mt-4 gap-3">
        <AvatarUpload />
        <View>
          <Text className="text-xs text-muted-foreground">{t("common.name")}</Text>
          <Text className="font-medium text-foreground">{user?.name ?? t("common.user")}</Text>
        </View>
        <View>
          <Text className="text-xs text-muted-foreground">{t("settings.emailAddress")}</Text>
          <Text className="font-medium text-foreground">{user?.email}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">{t("settings.authRole")}</Text>
          <Text className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{user?.role}</Text>
        </View>
      </View>
    </Card>
  );
}
