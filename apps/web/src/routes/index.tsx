import { createFileRoute, redirect } from "@tanstack/react-router";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const destination = useAuthStore.getState().user
      ? FRONTEND_ROUTES.dashboard
      : FRONTEND_ROUTES.auth;
    throw redirect({ to: destination });
  },
});
