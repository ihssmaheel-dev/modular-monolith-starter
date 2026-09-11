import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { LoginSchema, type LoginInput } from "@repo/contracts";
import {
  loginMutationOptions,
  resendVerificationMutationOptions,
} from "@/features/auth/auth.mutations";
import { useAuthStore } from "@/stores/auth.store";
import { AuthScreen } from "@/components/auth-screen";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { t } = useTranslation();
  const { inviteToken } = useLocalSearchParams<{ inviteToken?: string }>();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });
  const mutation = useMutation({
    ...loginMutationOptions(),
    onSuccess: (data) => {
      setAuth(data);
      router.replace(
        inviteToken
          ? { pathname: "/accept-invitation", params: { token: inviteToken } }
          : "/(tabs)",
      );
    },
  });
  const resendMutation = useMutation(resendVerificationMutationOptions());
  const needsVerification = mutation.isError && mutation.error.message === "auth.emailNotVerified";

  return (
    <AuthScreen title={t("auth.login")} description={t("auth.loginDescription")}>
      <Card className="gap-4">
        <View className="gap-1.5">
          <Label>{t("auth.email")}</Label>
          <Controller
            control={form.control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                invalid={!!form.formState.errors.email}
              />
            )}
          />
          <FieldError message={form.formState.errors.email?.message} />
        </View>
        <View className="gap-1.5">
          <View className="flex-row items-center justify-between">
            <Label>{t("auth.password")}</Label>
            <Link href="/(auth)/forgot-password" className="text-xs text-foreground underline">
              {t("auth.forgotPassword")}
            </Link>
          </View>
          <Controller
            control={form.control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                secureTextEntry={!showPassword}
                autoComplete="password"
                placeholder={t("auth.passwordPlaceholder")}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                invalid={!!form.formState.errors.password}
              />
            )}
          />
          <FieldError message={form.formState.errors.password?.message} />
          <Pressable onPress={() => setShowPassword((v) => !v)}>
            <Text className="text-xs text-muted-foreground">
              {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
            </Text>
          </Pressable>
        </View>
        {mutation.isError && (
          <Text className="text-sm text-destructive">{t(mutation.error.message)}</Text>
        )}
        {needsVerification &&
          (resendMutation.isSuccess ? (
            <Text className="text-sm text-muted-foreground">{t("auth.verificationSent")}</Text>
          ) : (
            <Pressable
              disabled={resendMutation.isPending}
              onPress={() => resendMutation.mutate(form.getValues("email"))}
            >
              <Text className="text-center text-sm text-primary">
                {t("auth.resendVerification")}
              </Text>
            </Pressable>
          ))}
        <Button
          loading={mutation.isPending}
          onPress={form.handleSubmit((data) => mutation.mutate(data))}
        >
          {mutation.isPending ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
        <Link href="/(auth)/register" className="text-center text-sm text-muted-foreground">
          {t("auth.noAccount")} {t("auth.register")}
        </Link>
      </Card>
    </AuthScreen>
  );
}
