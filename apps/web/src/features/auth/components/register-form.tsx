import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { FRONTEND_ROUTES, RegisterSchema, type RegisterInput } from "@repo/contracts";
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
  registerMutationOptions,
  resendVerificationMutationOptions,
} from "@/features/auth/auth.mutations";
import { stashPendingInviteToken } from "@/features/auth/components/verify-email-form";
import { FieldError } from "@/features/auth/components/field-error";
import { PasswordInput } from "@/features/auth/components/password-input";

export function RegisterForm({ inviteToken }: { inviteToken?: string }) {
  const { t } = useTranslation();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const mutation = useMutation({
    ...registerMutationOptions(),
    onSuccess: (_data, variables) => {
      if (inviteToken) stashPendingInviteToken(inviteToken);
      setRegisteredEmail(variables.email);
    },
  });
  const resendMutation = useMutation(resendVerificationMutationOptions());

  if (registeredEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.checkInboxTitle")}</CardTitle>
          <CardDescription>{t("auth.checkInboxDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-10 text-primary" />
          {resendMutation.isSuccess ? (
            <p className="text-sm text-muted-foreground">{t("auth.verificationSent")}</p>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              disabled={resendMutation.isPending}
              onClick={() => resendMutation.mutate(registeredEmail)}
            >
              {t("auth.resendVerification")}
            </Button>
          )}
          <Button variant="ghost" className="w-full" render={<Link to={FRONTEND_ROUTES.auth} />}>
            {t("auth.backToLogin")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.createAccountTitle")}</CardTitle>
        <CardDescription>{t("auth.registerDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reg-name">{t("auth.name")}</Label>
            <Input
              id="reg-name"
              autoComplete="name"
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register("name")}
            />
            <FieldError message={form.formState.errors.name?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email">{t("auth.email")}</Label>
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
            <FieldError message={form.formState.errors.email?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-password">{t("auth.password")}</Label>
            <PasswordInput<RegisterInput>
              id="reg-password"
              register={form.register}
              placeholder={t("auth.createPasswordPlaceholder")}
              invalid={Boolean(form.formState.errors.password)}
              showLabel={t("auth.showPassword")}
              hideLabel={t("auth.hidePassword")}
            />
            <FieldError message={form.formState.errors.password?.message} />
          </div>
          <p className="text-xs text-muted-foreground">{t("auth.termsNotice")}</p>
          {mutation.isError && (
            <p className="text-sm text-destructive">{t(mutation.error.message)}</p>
          )}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t("auth.creatingAccount") : t("auth.createAccount")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
