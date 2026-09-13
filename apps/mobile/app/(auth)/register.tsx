import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { resendVerificationMutationOptions } from "@/features/auth/auth.mutations";
import { AuthScreen } from "@/components/auth-screen";
import { useTheme } from "@/theme/theme-provider";
import { mobileTokens } from "@/theme/tokens.generated";
import { RegisterForm } from "@/features/auth/components/register-form";

export default function Register() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const colors = mobileTokens[resolvedTheme];
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const resendMutation = useMutation(resendVerificationMutationOptions());

  if (registeredEmail) {
    return (
      <AuthScreen title={t("auth.checkInboxTitle")} description={t("auth.checkInboxDescription")}>
        <View style={{ backgroundColor: colors.card }} className="gap-4 rounded-2xl p-5 shadow-sm">
          {resendMutation.isSuccess ? (
            <Text className="text-center text-sm text-muted-foreground">
              {t("auth.verificationSent")}
            </Text>
          ) : (
            <Pressable
              className="rounded-lg border border-border py-3 disabled:opacity-50"
              disabled={resendMutation.isPending}
              onPress={() => resendMutation.mutate(registeredEmail)}
            >
              <Text className="text-center font-semibold text-foreground">
                {t("auth.resendVerification")}
              </Text>
            </Pressable>
          )}
          <Link href="/(auth)/login" className="text-center text-sm text-muted-foreground">
            {t("auth.backToLogin")}
          </Link>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={t("auth.createAccountTitle")} description={t("auth.registerDescription")}>
      <RegisterForm onSuccess={(email) => setRegisteredEmail(email)} />
    </AuthScreen>
  );
}
