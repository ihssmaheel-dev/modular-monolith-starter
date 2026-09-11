import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { mobileTokens } from "@/theme/tokens.generated";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { RegisterSchema, type RegisterInput } from "@repo/contracts";
import {
  registerMutationOptions,
  resendVerificationMutationOptions,
} from "@/features/auth/auth.mutations";
import { AuthScreen } from "@/components/auth-screen";

export default function Register() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const colors = mobileTokens[resolvedTheme];
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const mutation = useMutation({
    ...registerMutationOptions(),
    // No session is issued before verification; invitation links stay valid
    // server-side, so the user verifies, signs in, then follows the invite.
    onSuccess: (_data, variables) => setRegisteredEmail(variables.email),
  });
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
      <View style={{ backgroundColor: colors.card }} className="gap-4 rounded-2xl p-5 shadow-sm">
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-foreground">{t("auth.name")}</Text>
          <Controller
            control={form.control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="rounded-lg border border-border px-3 py-2.5 text-base text-foreground"
                autoComplete="name"
                placeholder={t("auth.namePlaceholder")}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {form.formState.errors.name && (
            <Text className="text-xs text-destructive">{form.formState.errors.name.message}</Text>
          )}
        </View>
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-foreground">{t("auth.email")}</Text>
          <Controller
            control={form.control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="rounded-lg border border-border px-3 py-2.5 text-base text-foreground"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {form.formState.errors.email && (
            <Text className="text-xs text-destructive">{form.formState.errors.email.message}</Text>
          )}
        </View>
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-foreground">{t("auth.password")}</Text>
          <Controller
            control={form.control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className="rounded-lg border border-border px-3 py-2.5 text-base text-foreground"
                secureTextEntry={!showPassword}
                autoComplete="password-new"
                placeholder={t("auth.createPasswordPlaceholder")}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {form.formState.errors.password && (
            <Text className="text-xs text-destructive">
              {form.formState.errors.password.message}
            </Text>
          )}
          <Pressable onPress={() => setShowPassword((v) => !v)}>
            <Text className="text-xs text-muted-foreground">
              {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
            </Text>
          </Pressable>
        </View>
        <Text className="text-xs text-muted-foreground">{t("auth.termsNotice")}</Text>
        {mutation.isError && (
          <Text className="text-sm text-destructive">{t(mutation.error.message)}</Text>
        )}
        <Pressable
          className="rounded-lg bg-primary py-3 disabled:opacity-50"
          disabled={mutation.isPending}
          onPress={form.handleSubmit((data) => mutation.mutate(data))}
        >
          <Text className="text-center font-semibold text-primary-foreground">
            {mutation.isPending ? t("auth.creatingAccount") : t("auth.createAccount")}
          </Text>
        </Pressable>
        <Link href="/(auth)/login" className="text-center text-sm text-muted-foreground">
          {t("auth.hasAccount")} {t("auth.login")}
        </Link>
      </View>
    </AuthScreen>
  );
}
