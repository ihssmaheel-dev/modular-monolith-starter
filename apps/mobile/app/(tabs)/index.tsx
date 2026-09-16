import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { notesListQuery } from "@/features/notes/notes.queries";
import { useAuthStore } from "@/stores/auth.store";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { getMobileEnv } from "@/lib/env";

export default function Dashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { EXPO_PUBLIC_APP_NAME: appName, EXPO_PUBLIC_EXAMPLE_FEATURES_ENABLED: examplesEnabled } =
    getMobileEnv();
  const notesQuery = useQuery({ ...notesListQuery(1, 5), enabled: !!user && examplesEnabled });

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, gap: 16 }}>
      <PageHeader
        title={t("dashboard.welcome", { name: user?.name ?? "" })}
        description={t("dashboard.subtitle", { appName })}
      />

      {examplesEnabled && (
        <Card>
          <Text className="text-xs font-medium text-muted-foreground">{t("notes.title")}</Text>
          {notesQuery.isLoading ? (
            <ActivityIndicator className="mt-3" />
          ) : (
            <Text className="mt-1 text-3xl font-bold text-foreground">
              {notesQuery.data?.total ? String(notesQuery.data.total) : "0"}
            </Text>
          )}
          <Link href="/(tabs)/notes" className="mt-2 text-sm font-medium text-foreground underline">
            {t("notes.title")}
          </Link>
        </Card>
      )}

      {examplesEnabled && (
        <Card>
          <Text className="mb-3 text-base font-bold text-foreground">
            {t("dashboard.recentNotes")}
          </Text>
          {notesQuery.isLoading ? (
            <ActivityIndicator />
          ) : notesQuery.isError ? (
            <Text className="text-sm text-destructive">{t("errors.networkError")}</Text>
          ) : notesQuery.data?.items && notesQuery.data.items.length > 0 ? (
            <View className="gap-3">
              {notesQuery.data.items.map((note) => (
                <View key={note.id} className="border-b border-border pb-3">
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                    {note.title}
                  </Text>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {note.content}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="items-center gap-2 py-4">
              <Text className="text-sm font-medium">{t("notes.noNotes")}</Text>
              <Link href="/notes/new" className="text-sm font-medium text-foreground underline">
                {t("notes.newNote")}
              </Link>
            </View>
          )}
        </Card>
      )}

      {examplesEnabled && (
        <Link href="/notes/new" asChild>
          <Button>{t("notes.newNote")}</Button>
        </Link>
      )}
    </ScrollView>
  );
}
