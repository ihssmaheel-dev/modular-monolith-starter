import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, MailWarning } from "lucide-react";
import { AcceptInvitationSchema, FRONTEND_ROUTES } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { acceptInvitationMutationOptions } from "@/features/tenancy/tenancy.mutations";
import { useAuthStore } from "@/stores/auth.store";

function InvitationCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

export function AcceptInvitationFlow({ token }: { token: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isValidToken = AcceptInvitationSchema.safeParse({ token }).success;
  const mutation = useMutation({ ...acceptInvitationMutationOptions() });

  if (!isValidToken) {
    return (
      <InvitationCard>
        <CardHeader>
          <MailWarning className="size-8 text-destructive" />
          <CardTitle>{t("tenancy.invalidInvitationLink")}</CardTitle>
          <CardDescription>{t("tenancy.invalidInvitationDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" render={<Link to={FRONTEND_ROUTES.login} />}>
            {t("auth.backToLogin")}
          </Button>
        </CardContent>
      </InvitationCard>
    );
  }

  if (!user) {
    return (
      <InvitationCard>
        <CardHeader>
          <CardTitle>{t("tenancy.acceptInvitation")}</CardTitle>
          <CardDescription>{t("tenancy.signInToAccept")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            render={<Link to={FRONTEND_ROUTES.login} search={{ inviteToken: token }} />}
          >
            {t("auth.signIn")}
          </Button>
        </CardContent>
      </InvitationCard>
    );
  }

  if (mutation.isSuccess) {
    return (
      <InvitationCard>
        <CardHeader className="text-center">
          <CheckCircle2 className="mx-auto size-10 text-primary" />
          <CardTitle>{t("tenancy.invitationAccepted")}</CardTitle>
          <CardDescription>{t("tenancy.invitationAcceptedDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" render={<Link to={FRONTEND_ROUTES.dashboard} />}>
            {t("tenancy.goToWorkspace")}
          </Button>
        </CardContent>
      </InvitationCard>
    );
  }

  return (
    <InvitationCard>
      <CardHeader>
        <CardTitle>{t("tenancy.acceptInvitation")}</CardTitle>
        <CardDescription>{t("tenancy.acceptInvitationDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mutation.isError && (
          <p className="text-sm text-destructive">{t("tenancy.acceptFailed")}</p>
        )}
        <Button
          className="w-full"
          onClick={() => mutation.mutate(token)}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t("tenancy.accepting") : t("tenancy.accept")}
        </Button>
      </CardContent>
    </InvitationCard>
  );
}
