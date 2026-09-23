import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { RegisterForm } from "@/features/auth/components/register-form";

const authApi = getRouteApi("/_auth-layout");

export const Route = createFileRoute("/_auth-layout/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useTranslation();
  const search = authApi.useSearch();
  const inviteToken = search.inviteToken;

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Layers className="size-6" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {t("auth.createAccountTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("auth.registerDescription")}</p>
      </div>

      <RegisterForm inviteToken={inviteToken} hideHeader />

      <p className="text-center text-sm text-muted-foreground">
        {t("auth.hasAccount")}{" "}
        <Link
          to={FRONTEND_ROUTES.login}
          search={inviteToken ? { inviteToken } : undefined}
          className="font-medium text-primary hover:underline"
        >
          {t("auth.login")}
        </Link>
      </p>
    </div>
  );
}
