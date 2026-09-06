import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { mobileTokens } from "@/theme/tokens.generated";
import { Link } from "expo-router";
import { noteDetailPath } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { notesListQuery } from "@/features/notes/notes.queries";
import { useDeleteNoteMutation } from "@/features/notes/notes.mutations";

export default function Notes() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const colors = mobileTokens[resolvedTheme];
  const [page, setPage] = useState(1);
  const limit = 20;
  const notesQuery = useQuery({ ...notesListQuery(page, limit) });
  const deleteMutation = useDeleteNoteMutation();

  const confirmDelete = (id: string, title: string) => {
    Alert.alert(t("common.delete"), t("notes.deleteConfirm", { title }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deleteMutation.mutate(id),
      },
    ]);
  };

  return (
    <View style={{ backgroundColor: colors.background }} className="flex-1">
      <FlatList
        data={notesQuery.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={notesQuery.isRefetching}
            onRefresh={() => notesQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-foreground">
              {t("notes.title")} ({notesQuery.data?.total ?? "—"})
            </Text>
            <Link href="/notes/new" className="text-sm font-medium text-foreground underline">
              {t("notes.newNote")}
            </Link>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{ backgroundColor: colors.card }}
            className="flex-row items-center justify-between gap-3 rounded-xl p-4 shadow-sm"
          >
            <View className="min-w-0 flex-1">
              <Link href={noteDetailPath(item.id) as "/notes/[id]"}>
                <Text className="font-medium text-foreground underline" numberOfLines={1}>
                  {item.title}
                </Text>
              </Link>
              <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                {item.content}
              </Text>
            </View>
            <Pressable onPress={() => confirmDelete(item.id, item.title)} className="px-2 py-1">
              <Text className="text-sm font-medium text-destructive">{t("common.delete")}</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          notesQuery.isLoading ? (
            <ActivityIndicator className="mt-10" />
          ) : notesQuery.isError ? (
            <View className="items-center gap-2 rounded-xl border border-destructive p-6">
              <Text className="text-sm text-destructive">{t("errors.networkError")}</Text>
              <Pressable onPress={() => notesQuery.refetch()}>
                <Text className="text-sm font-medium underline">{t("common.retry")}</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="mt-10 text-center text-sm text-muted-foreground">
              {t("notes.noNotes")}
            </Text>
          )
        }
        ListFooterComponent={
          notesQuery.data && notesQuery.data.totalPages > 1 ? (
            <View className="flex-row items-center justify-between pt-2">
              <Pressable
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-border px-4 py-2 disabled:opacity-40"
              >
                <Text className="text-sm font-medium">{t("common.previous")}</Text>
              </Pressable>
              <Text className="text-xs text-muted-foreground">
                {t("common.pageOf", { page, totalPages: notesQuery.data.totalPages })}
              </Text>
              <Pressable
                disabled={page >= (notesQuery.data?.totalPages ?? 1)}
                onPress={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-4 py-2 disabled:opacity-40"
              >
                <Text className="text-sm font-medium">{t("common.next")}</Text>
              </Pressable>
            </View>
          ) : null
        }
      />
    </View>
  );
}
