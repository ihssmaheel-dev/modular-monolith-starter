import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useAuthStore } from "@/stores/auth.store";
import { verifyEmailChangeMutationOptions } from "@/features/users/users.mutations";

export function EmailChangeForm({ token }: { token: string }) {
  const { t } = useTranslation();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    ...verifyEmailChangeMutationOptions(),
    onSuccess: () => {
      // The address change bumps authVersion, voiding every session
      // including this one: drop local credentials with the confirmation.
      clearAuth();
      setDone(true);
    },
  });

  if (!token)
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.invalidToken")}</CardTitle>
          <CardDescription>{t("users.changeEmailFailed")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" render={<Link to={FRONTEND_ROUTES.auth} />}>
            {t("auth.backToLogin")}
          </Button>
        </CardContent>
      </Card>
    );

  if (done)
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("users.changeEmailTitle")}</CardTitle>
          <CardDescription>{t("users.emailChanged")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <Link to={FRONTEND_ROUTES.auth} className="underline">
            {t("auth.backToLogin")}
          </Link>
        </CardContent>
      </Card>
    );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("users.changeEmailTitle")}</CardTitle>
        <CardDescription>{t("users.changeEmailDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mutation.isError ? (
          <p className="text-sm text-destructive">{t("users.changeEmailFailed")}</p>
        ) : null}
        <Button
          className="w-full"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(token)}
        >
          {mutation.isPending ? t("users.confirmingEmail") : t("users.confirmEmail")}
        </Button>
      </CardContent>
    </Card>
  );
}
