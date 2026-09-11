import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { FRONTEND_ROUTES, LoginSchema, type LoginInput } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  loginMutationOptions,
  resendVerificationMutationOptions,
} from "@/features/auth/auth.mutations";
import { useAuthSuccess } from "@/features/auth/hooks/use-auth-success";
import { FieldError } from "@/features/auth/components/field-error";
import { PasswordInput } from "@/features/auth/components/password-input";

export function LoginForm({ inviteToken }: { inviteToken?: string }) {
  const { t } = useTranslation();
  const onSuccess = useAuthSuccess(inviteToken);
  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });
  const mutation = useMutation({ ...loginMutationOptions(), onSuccess });
  const resendMutation = useMutation(resendVerificationMutationOptions());
  const needsVerification = mutation.error?.message === "auth.emailNotVerified";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.login")}</CardTitle>
        <CardDescription>{t("auth.loginDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">{t("auth.email")}</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
            <FieldError message={form.formState.errors.email?.message} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">{t("auth.password")}</Label>
              <Link
                to={FRONTEND_ROUTES.forgotPassword}
                className="text-xs text-primary hover:underline"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
            <PasswordInput<LoginInput>
              id="login-password"
              register={form.register}
              placeholder={t("auth.passwordPlaceholder")}
              invalid={Boolean(form.formState.errors.password)}
              showLabel={t("auth.showPassword")}
              hideLabel={t("auth.hidePassword")}
            />
            <FieldError message={form.formState.errors.password?.message} />
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">{t(mutation.error.message)}</p>
          )}
          {needsVerification &&
            (resendMutation.isSuccess ? (
              <p className="text-sm text-muted-foreground">{t("auth.verificationSent")}</p>
            ) : (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm"
                disabled={resendMutation.isPending}
                onClick={() => resendMutation.mutate(form.getValues("email"))}
              >
                {t("auth.resendVerification")}
              </Button>
            ))}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
