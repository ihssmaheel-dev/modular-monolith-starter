import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { FRONTEND_ROUTES, ResetPasswordSchema, type ResetPasswordInput } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { resetPasswordMutationOptions } from "@/features/auth/auth.mutations";
import { FieldError } from "@/features/auth/components/field-error";

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [complete, setComplete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token, password: "" },
  });
  const mutation = useMutation({
    ...resetPasswordMutationOptions(),
    onSuccess: () => setComplete(true),
  });
  const submit = (data: ResetPasswordInput) => {
    if (data.password !== confirmation) {
      form.setError("password", { type: "validate", message: t("auth.passwordsDoNotMatch") });
      return;
    }
    mutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-2xl bg-destructive text-destructive-foreground shadow-sm">
            <KeyRound className="size-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("auth.invalidToken")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.resetFailed")}</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Button className="w-full" render={<Link to={FRONTEND_ROUTES.forgotPassword} />}>
              {t("auth.sendResetLink")}
            </Button>
          </CardContent>
        </Card>
        <div className="text-center">
          <Link
            to={FRONTEND_ROUTES.auth}
            className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t("auth.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <CheckCircle2 className="size-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("auth.passwordReset")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.passwordResetDescription")}</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Button className="w-full" onClick={() => navigate({ to: FRONTEND_ROUTES.auth })}>
              {t("auth.backToLogin")}
            </Button>
          </CardContent>
        </Card>
        <div className="text-center">
          <Link
            to={FRONTEND_ROUTES.auth}
            className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t("auth.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("auth.resetPasswordTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.resetPasswordDescription")}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password">{t("auth.newPassword")}</Label>
              <Input
                id="reset-password"
                type="password"
                placeholder={t("auth.passwordPlaceholder")}
                autoComplete="new-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                {...form.register("password")}
              />
              <FieldError message={form.formState.errors.password?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm-password">{t("auth.confirmPassword")}</Label>
              <Input
                id="reset-confirm-password"
                type="password"
                placeholder={t("auth.passwordPlaceholder")}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-invalid={
                  confirmation.length > 0 && confirmation !== form.getValues("password")
                }
              />
            </div>
            {mutation.isError && (
              <p className="text-sm text-destructive">{t("auth.resetFailed")}</p>
            )}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? t("auth.resettingPassword") : t("auth.resetPassword")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="text-center">
        <Link
          to={FRONTEND_ROUTES.auth}
          className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("auth.backToLogin")}
        </Link>
      </div>
    </div>
  );
}
