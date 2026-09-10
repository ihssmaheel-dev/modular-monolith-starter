import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryProvider } from "@/lib/query-client";
import { applyLocale } from "@/lib/i18n";
import { getApiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { useLocaleStore } from "@/stores/locale.store";
import { useTenantStore } from "@/stores/tenant.store";
import { useThemeStore } from "@/stores/theme.store";
import { ThemeProvider } from "@/theme/theme-provider";
import { PushBootstrap } from "@/components/push-bootstrap";
import { Toaster } from "@/components/ui/toast";
import "../global.css";

export { ErrorBoundary } from "@/components/error-boundary";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.all([
        useAuthStore.persist.rehydrate(),
        useLocaleStore.persist.rehydrate(),
        useTenantStore.persist.rehydrate(),
        useThemeStore.persist.rehydrate(),
      ]);
      if (!active) return;
      applyLocale(useLocaleStore.getState().locale);
      if (useAuthStore.getState().status === "loading") {
        try {
          const res = await getApiClient().auth.me();
          if (res.status === 200 && res.body?.user) useAuthStore.getState().setUser(res.body.user);
          else useAuthStore.getState().clearAuth();
        } catch {
          useAuthStore.getState().clearAuth();
        }
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!ready || status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <QueryProvider>
      <ThemeProvider>
        <PushBootstrap />
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
        <Toaster />
      </ThemeProvider>
    </QueryProvider>
  );
}
