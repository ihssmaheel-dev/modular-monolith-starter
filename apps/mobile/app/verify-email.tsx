import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { verifyEmailMutationOptions } from "@/features/auth/auth.mutations";
import { useAuthStore } from "@/stores/auth.store";
import { AuthScreen } from "@/components/auth-screen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    ...verifyEmailMutationOptions(),
    onSuccess: (data) => {
      setAuth(data);
      setDone(true);
    },
  });

  if (!token) {
    return (
      <AuthScreen title={t("auth.invalidToken")} description={t("auth.checkInboxDescription")}>
        <Card className="gap-4">
          <Link href="/(auth)/login" className="text-center text-sm text-muted-foreground">
            {t("auth.backToLogin")}
          </Link>
        </Card>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={t("auth.verifyTitle")} description={t("auth.verifyDescription")}>
      <Card className="gap-4">
        {done ? (
          <View className="gap-4">
            <Text className="text-center text-sm text-muted-foreground">
              {t("auth.emailVerified")}
            </Text>
            <Button onPress={() => router.replace("/(tabs)")}>{t("auth.login")}</Button>
          </View>
        ) : (
          <View className="gap-4">
            {mutation.isError && (
              <Text className="text-sm text-destructive">{t(mutation.error.message)}</Text>
            )}
            <Button loading={mutation.isPending} onPress={() => mutation.mutate(token)}>
              {mutation.isPending ? t("auth.verifying") : t("auth.verifyButton")}
            </Button>
            <Pressable onPress={() => router.replace("/(auth)/login")}>
              <Text className="text-center text-sm text-muted-foreground">
                {t("auth.backToLogin")}
              </Text>
            </Pressable>
          </View>
        )}
      </Card>
    </AuthScreen>
  );
}
