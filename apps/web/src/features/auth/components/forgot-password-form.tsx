import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { ForgotPasswordSchema, FRONTEND_ROUTES, type ForgotPasswordInput } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { forgotPasswordMutationOptions } from "@/features/auth/auth.mutations";
import { FieldError } from "@/features/auth/components/field-error";

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const mutation = useMutation({
    ...forgotPasswordMutationOptions(),
    onSuccess: (_data, variables) => {
      setSubmittedEmail(variables.email);
      setSent(true);
    },
  });

  const handleRetry = () => {
    setSent(false);
    form.reset({ email: submittedEmail });
  };

  return (
    <div className="w-full max-w-md space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          {sent ? <MailCheck className="size-5" /> : <KeyRound className="size-5" />}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {sent ? t("auth.checkEmail") : t("auth.forgotPassword")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {sent ? t("auth.checkEmailDescription") : t("auth.forgotDescription")}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {sent ? (
            <div className="space-y-4">
              {submittedEmail ? (
                <div className="rounded-lg border border-border/60 bg-muted/40 p-3.5 text-center text-sm">
                  <p className="text-xs text-muted-foreground">{t("auth.email")}</p>
                  <p className="mt-0.5 font-medium text-foreground break-all">{submittedEmail}</p>
                </div>
              ) : null}
              <Button className="w-full" render={<Link to={FRONTEND_ROUTES.login} />}>
                {t("auth.backToLogin")}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleRetry}>
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              noValidate
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="forgot-email">{t("auth.email")}</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  autoComplete="email"
                  autoFocus
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
                <FieldError message={form.formState.errors.email?.message} />
              </div>
              {mutation.isError && (
                <p className="text-sm text-destructive">{t("auth.requestFailed")}</p>
              )}
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? t("auth.sending") : t("auth.sendResetLink")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="text-center">
        <Link
          to={FRONTEND_ROUTES.login}
          className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("auth.backToLogin")}
        </Link>
      </div>
    </div>
  );
}
