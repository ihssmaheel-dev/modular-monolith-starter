import { useNavigate } from "@tanstack/react-router";
import { FRONTEND_ROUTES, type AuthResponse } from "@repo/contracts";
import { useAuthStore } from "@/stores/auth.store";
import { publishSignedIn } from "@/lib/cross-tab/auth-sync";

export function useAuthSuccess(inviteToken?: string) {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  return (data: AuthResponse) => {
    setAuth(data);
    publishSignedIn(data);
    if (inviteToken) {
      navigate({ to: FRONTEND_ROUTES.acceptInvitation, search: { token: inviteToken } });
      return;
    }
    navigate({ to: FRONTEND_ROUTES.dashboard });
  };
}
