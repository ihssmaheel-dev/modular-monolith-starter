import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { AppShell } from "@/components/app-shell";
import { getApiClient } from "@/lib/api";
import { useTranslation } from "react-i18next";

let verificationPromise: Promise<boolean> | null = null;

export async function verifySession(): Promise<boolean> {
  if (useAuthStore.getState().status === "authenticated") return true;
  if (verificationPromise) return verificationPromise;

  verificationPromise = (async () => {
    try {
      const response = await getApiClient().auth.me();
      if (response.status === 200 && response.body?.user) {
        useAuthStore.getState().setUser(response.body.user);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      verificationPromise = null;
    }
  })();

  return verificationPromise;
}

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const auth = useAuthStore.getState();
    if (auth.status === "unauthenticated" || !auth.user) {
      throw redirect({ to: FRONTEND_ROUTES.auth, replace: true });
    }

    if (auth.status === "loading") {
      const verified = await verifySession();
      if (!verified) {
        useAuthStore.getState().clearAuth();
        throw redirect({ to: FRONTEND_ROUTES.auth, replace: true });
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
      void navigate({ to: FRONTEND_ROUTES.auth, replace: true });
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
