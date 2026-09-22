import {
  createRootRouteWithContext,
  Outlet,
  HeadContent,
  Scripts,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { THEME_BOOTSTRAP_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@repo/ui/components/ui/toast";
import { QueryProvider } from "@/lib/query-client";
import { I18nProvider } from "@/lib/i18n";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { getWebEnv, isDev } from "@/lib/env";
import { RootError, RootNotFound, RootPending } from "@/components/root-route-states";
import { initAuthSync } from "@/lib/cross-tab/auth-sync";
import { QueryBroadcaster } from "@/lib/cross-tab/query-sync";
import { ThemeSync } from "@/lib/cross-tab/theme-sync";
import { LocaleSync } from "@/lib/cross-tab/locale-sync";
import { TenantSync } from "@/lib/cross-tab/tenant-sync";
import { initGlobalErrorListeners } from "@/lib/client-beacon";
import { buildDocumentCsp } from "@/lib/security/csp";
import { useEffect } from "react";
import "@repo/ui/globals.css";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  headers: ({ ssr }) => {
    if (!ssr?.nonce) return undefined;
    return {
      "Content-Security-Policy": buildDocumentCsp(ssr.nonce, getWebEnv().VITE_API_URL),
    };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: getWebEnv().VITE_APP_NAME },
    ],
    links: [{ rel: "icon", href: "/favicon.ico" }],
  }),
  component: RootComponent,
  notFoundComponent: RootNotFound,
  errorComponent: RootError,
  pendingComponent: RootPending,
});

function RootComponent() {
  const navigate = useNavigate();
  const router = useRouter();
  const nonce = router.options.ssr?.nonce;
  useEffect(() => initGlobalErrorListeners(), []);
  useEffect(
    () =>
      initAuthSync({
        onSignedOut: () => {
          void navigate({ to: FRONTEND_ROUTES.auth, replace: true });
        },
        onSignedIn: () => {
          if (
            typeof window !== "undefined" &&
            window.location.pathname.startsWith(FRONTEND_ROUTES.auth)
          ) {
            void navigate({ to: FRONTEND_ROUTES.dashboard, replace: true });
          }
        },
      }),
    [navigate],
  );
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="min-h-svh bg-background font-sans antialiased isolation-auto">
        <QueryProvider>
          <QueryBroadcaster />
          <I18nProvider>
            <LocaleSync />
            <ThemeProvider defaultTheme="system" storageKey="theme">
              <ThemeSync />
              <TenantSync />
              <div id="root">
                <Outlet />
              </div>
              <Toaster />
              {isDev ? <TanStackRouterDevtools position="bottom-right" /> : null}
            </ThemeProvider>
          </I18nProvider>
        </QueryProvider>
        <Scripts />
      </body>
    </html>
  );
}
