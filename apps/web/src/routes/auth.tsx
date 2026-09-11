import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { inviteToken?: string } => ({
    inviteToken: typeof search.inviteToken === "string" ? search.inviteToken : undefined,
  }),
  beforeLoad: () => {
    if (useAuthStore.getState().status === "authenticated") {
      throw redirect({ to: FRONTEND_ROUTES.dashboard, replace: true });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 p-4">
      <Outlet />
    </div>
  );
}
