import { useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { LoginForm } from "@/features/auth/components/login-form";
import { RegisterForm } from "@/features/auth/components/register-form";

const authApi = getRouteApi("/auth");

export const Route = createFileRoute("/auth/")({
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const { inviteToken } = authApi.useSearch();
  const [tab, setTab] = useState<string>("login");

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Layers className="size-6" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {tab === "register" ? t("auth.createAccountTitle") : t("auth.welcomeBack")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tab === "register" ? t("auth.registerDescription") : t("auth.loginDescription")}
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">{t("auth.login")}</TabsTrigger>
          <TabsTrigger value="register">{t("auth.register")}</TabsTrigger>
        </TabsList>
        <TabsContent value="login">
          <LoginForm inviteToken={inviteToken} hideHeader />
        </TabsContent>
        <TabsContent value="register">
          <RegisterForm inviteToken={inviteToken} hideHeader />
        </TabsContent>
      </Tabs>
    </div>
  );
}
