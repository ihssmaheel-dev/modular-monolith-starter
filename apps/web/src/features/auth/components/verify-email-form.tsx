import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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
import { verifyEmailMutationOptions } from "@/features/auth/auth.mutations";

const PENDING_INVITE_KEY = "pendingInviteToken";

export function readPendingInviteToken(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function stashPendingInviteToken(token: string): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    // Storage unavailable (private mode): the invite link itself still works.
  }
}

function takePendingInviteToken(): string | null {
  try {
    const token = sessionStorage.getItem(PENDING_INVITE_KEY);
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    return token;
  } catch {
    return null;
  }
}

export function VerifyEmailForm({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    ...verifyEmailMutationOptions(),
    onSuccess: (data) => {
      setAuth(data);
      setDone(true);
    },
  });

  if (!token)
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.invalidToken")}</CardTitle>
          <CardDescription>{t("auth.checkInboxDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" render={<Link to={FRONTEND_ROUTES.auth} />}>
            {t("auth.backToLogin")}
          </Button>
        </CardContent>
      </Card>
    );

  const continueNext = () => {
    // The token is consumed server-side on verify, so it is safe to clear here.
    const inviteToken = takePendingInviteToken();
    if (inviteToken) {
      navigate({ to: FRONTEND_ROUTES.acceptInvitation, search: { token: inviteToken } });
      return;
    }
    navigate({ to: FRONTEND_ROUTES.dashboard });
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("auth.verifyTitle")}</CardTitle>
        <CardDescription>{t("auth.verifyDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto size-10 text-primary" />
            <p className="text-sm text-muted-foreground">{t("auth.emailVerified")}</p>
            <Button className="w-full" onClick={continueNext}>
              {t("auth.login")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {mutation.isError && (
              <p className="text-sm text-destructive">{t(mutation.error.message)}</p>
            )}
            <Button
              className="w-full"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(token)}
            >
              {mutation.isPending ? t("auth.verifying") : t("auth.verifyButton")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
