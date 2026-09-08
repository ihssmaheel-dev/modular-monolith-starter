import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { mobileTokens } from "@/theme/tokens.generated";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { notificationsListQuery } from "@/features/notifications/notifications.queries";
import {
  useMarkAllReadMutation,
  useMarkReadMutation,
} from "@/features/notifications/notifications.mutations";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PAGE_LIMIT = 20;

export default function Notifications() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const colors = mobileTokens[resolvedTheme];
  const [page, setPage] = useState(1);
  const feedQuery = useQuery({ ...notificationsListQuery(page, PAGE_LIMIT) });
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();

  return (
    <View style={{ backgroundColor: colors.background }} className="flex-1">
      <FlatList
        data={feedQuery.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isRefetching}
            onRefresh={() => feedQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-foreground">
              {t("notifications.title")} ({feedQuery.data?.total ?? "—"})
            </Text>
            <Button
              variant="outline"
              size="sm"
              loading={markAllRead.isPending}
              disabled={markAllRead.isPending}
              onPress={() => markAllRead.mutate()}
            >
              {t("notifications.markAllRead")}
            </Button>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            disabled={markRead.isPending}
            onPress={() => !item.readAt && markRead.mutate(item.id)}
          >
            <Card>
              <View className="flex-row items-center gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="font-medium text-foreground" numberOfLines={2}>
                    {t(item.titleKey, (item.titleParams as Record<string, string> | null) ?? {})}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {formatDateTime(item.createdAt)}
                  </Text>
                </View>
                {!item.readAt && (
                  <Text className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                    {t("notifications.unread")}
                  </Text>
                )}
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          feedQuery.isLoading ? (
            <ActivityIndicator className="mt-10" />
          ) : feedQuery.isError ? (
            <View className="mt-10 items-center gap-3">
              <Text className="text-center text-sm text-destructive">
                {t("api.notifications.fetchFailed")}
              </Text>
              <Button variant="outline" size="sm" onPress={() => feedQuery.refetch()}>
                {t("common.retry")}
              </Button>
            </View>
          ) : (
            <Text className="mt-10 text-center text-sm text-muted-foreground">
              {t("notifications.noNotifications")}
            </Text>
          )
        }
        ListFooterComponent={
          feedQuery.data && feedQuery.data.totalPages > 1 ? (
            <View className="flex-row items-center justify-between pt-2">
              <Pressable
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-border px-4 py-2 disabled:opacity-40"
              >
                <Text className="text-sm font-medium">{t("common.previous")}</Text>
              </Pressable>
              <Text className="text-xs text-muted-foreground">
                {t("common.pageOf", { page, totalPages: feedQuery.data.totalPages })}
              </Text>
              <Pressable
                disabled={page >= (feedQuery.data?.totalPages ?? 1)}
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
