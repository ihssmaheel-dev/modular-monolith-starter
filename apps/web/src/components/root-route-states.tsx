import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { FRONTEND_ROUTES } from "@repo/contracts";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { RouteErrorFallback } from "@/components/error-boundary";

export function RootNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-md">
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

export function RootError({ error, reset }: { error?: unknown; reset?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/20 p-6">
      <div className="w-full max-w-md space-y-3">
        <RouteErrorFallback
          error={error}
          reset={() => (reset ? reset() : window.location.reload())}
        />
        <Button variant="outline" className="w-full" render={<Link to={FRONTEND_ROUTES.home} />}>
          {t("common.back")}
        </Button>
      </div>
    </div>
  );
}

export function RootPending() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
    </div>
  );
}
