import { createApiClient, type ApiClient } from "@repo/api-client";
import { buildFrontendUrl, FRONTEND_ROUTES } from "@repo/contracts";
import { getWebEnv } from "./env";
import { useAuthStore } from "@/stores/auth.store";
import { useLocaleStore } from "@/stores/locale.store";
import { useTenantStore } from "@/stores/tenant.store";
import { clearIdentityBoundary } from "./identity-boundary";

import { publishRefreshed } from "./cross-tab/auth-sync";

let client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (client) return client;

  const env = getWebEnv();

  client = createApiClient(env.VITE_API_URL, {
    getAccessToken: () => useAuthStore.getState().accessToken,
    getAuthFingerprint: () => {
      const auth = useAuthStore.getState();
      return `${auth.status}:${auth.user?.id ?? "none"}:${auth.accessToken ?? "none"}`;
    },
    getLocale: () => useLocaleStore.getState().locale,
    getTenantId: () => useTenantStore.getState().tenantId,
    onAuthRefreshed: (response) => {
      useAuthStore.getState().setAuth(response);
      publishRefreshed(response);
    },
    onAuthFailure: async () => {
      await clearIdentityBoundary();
      if (typeof window !== "undefined") {
        const currentUrl = new URL(window.location.href);
        const token =
          currentUrl.pathname === FRONTEND_ROUTES.acceptInvitation
            ? currentUrl.searchParams.get("token")
            : null;
        window.location.href = token
          ? buildFrontendUrl(window.location.origin, FRONTEND_ROUTES.auth, {
              inviteToken: token,
            })
          : FRONTEND_ROUTES.auth;
      }
    },
  });

  return client;
}

export function resetApiClient() {
  client = null;
}
