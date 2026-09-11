import {
  createRootRouteWithContext,
  Outlet,
  HeadContent,
  Scripts,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { THEME_BOOTSTRAP_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@repo/ui/components/ui/toast";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { QueryProvider } from "@/lib/query-client";
import { I18nProvider } from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { getWebEnv } from "@/lib/env";
import { RouteErrorFallback } from "@/components/error-boundary";
import { initAuthSync } from "@/lib/cross-tab/auth-sync";
import { QueryBroadcaster } from "@/lib/cross-tab/query-sync";
import { useEffect } from "react";
import "@repo/ui/globals.css";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: getWebEnv().VITE_APP_NAME },
    ],
    links: [{ rel: "icon", href: "/favicon.ico" }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RootError,
  pendingComponent: RootPending,
});

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh items-center justify-center p-6 bg-muted/20">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>{t("errors.notFound")}</CardTitle>
          <CardDescription>{t("errors.notFound")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link to={FRONTEND_ROUTES.home} />} className="w-full">
            {t("common.back")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function RootError({ error, reset }: { error?: unknown; reset?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh items-center justify-center p-6 bg-muted/20">
      <div className="max-w-md w-full space-y-3">
        <RouteErrorFallback
          error={error}
          reset={() => {
            if (reset) reset();
            else window.location.reload();
          }}
        />
        <Button variant="outline" className="w-full" render={<Link to={FRONTEND_ROUTES.home} />}>
          {t("common.back")}
        </Button>
      </div>
    </div>
  );
}

function RootPending() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
    </div>
  );
}

function RootComponent() {
  const navigate = useNavigate();
  useEffect(
    () =>
      initAuthSync({
        onSignedOut: () => {
          void navigate({ to: FRONTEND_ROUTES.auth, replace: true });
        },
      }),
    [navigate],
  );
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-svh bg-background font-sans antialiased isolation-auto">
        <QueryProvider>
          <QueryBroadcaster />
          <I18nProvider>
            <ThemeProvider defaultTheme="system" storageKey="theme">
              <div id="root">
                <Outlet />
              </div>
              <Toaster />
              {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
            </ThemeProvider>
          </I18nProvider>
        </QueryProvider>
        <Scripts />
      </body>
    </html>
  );
}
