import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { AppShell } from "@/components/app-shell";
import { verifySession } from "@/lib/session-bootstrap";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const auth = useAuthStore.getState();
    if (auth.status === "unauthenticated" || !auth.user) {
      throw redirect({ to: FRONTEND_ROUTES.login, replace: true });
    }

    if (auth.status === "loading") {
      const verified = await verifySession();
      if (!verified) {
        if (useAuthStore.getState().status === "loading") useAuthStore.getState().clearAuth();
        throw redirect({ to: FRONTEND_ROUTES.login, replace: true });
      }
    }
  },
  component: ProtectedApp,
});

function ProtectedApp() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "unauthenticated") {
      void navigate({ to: FRONTEND_ROUTES.login, replace: true });
    }
  }, [navigate, status]);

  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }
  if (status === "unauthenticated") return null;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
