import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { inviteToken?: string } => ({
    inviteToken: typeof search.inviteToken === "string" ? search.inviteToken : undefined,
  }),
  beforeLoad: () => {
    if (
      useAuthStore.getState().status === "authenticated" ||
      Boolean(useAuthStore.getState().user)
    ) {
      throw redirect({ to: FRONTEND_ROUTES.dashboard, replace: true });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (status === "authenticated" || Boolean(user)) {
      void navigate({ to: FRONTEND_ROUTES.dashboard, replace: true });
    }
  }, [navigate, status, user]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 p-4">
      <Outlet />
    </div>
  );
}
